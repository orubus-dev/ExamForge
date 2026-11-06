import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, rateGuard } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  challenge_id: z.string().min(6).max(200),
  code: z.string().trim().regex(/^\d{4,8}$/, "Enter the digits Relay sent"),
});

function randomSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Relay OTP — step 2. Verify the code with Relay, find or create the
 * ExamForge account keyed on relay_external_id, then mint the session
 * SERVER-SIDE and hand the tokens straight back. No magic link, no email,
 * no redirect bounce — the code the user typed is the whole ceremony.
 */
export async function POST(req: Request) {
  const limited = rateGuard(req, "auth-relay-verify");
  if (limited) return limited;

  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { challenge_id, code } = parsed.data;

  const clientId = process.env.RELAY_CLIENT_ID;
  const clientSecret = process.env.RELAY_CLIENT_SECRET;
  const base =
    process.env.RELAY_API_BASE ||
    "https://gobwknacvpgysmgpvzqt.supabase.co/functions/v1/auth-challenge";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!clientId || !clientSecret || !url || !anonKey) {
    return bad("Relay sign-in is not configured yet.", 503);
  }

  try {
    const verifyRes = await fetch(`${base}/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, challenge_id, code }),
      cache: "no-store",
    });
    const v = (await verifyRes.json().catch(() => ({}))) as {
      ok?: boolean;
      external_id?: string;
      username?: string | null;
      display_name?: string | null;
      error?: string;
    };
    if (!verifyRes.ok || !v?.ok || !v.external_id) {
      return bad(v?.error ?? "That code is not valid or has expired.", verifyRes.status || 401);
    }
    const externalId = v.external_id;
    const relayUsername = v.username ?? null;
    const displayName = v.display_name ?? relayUsername ?? "Relay user";

    const admin = supabaseAdmin();

    const existing = await admin
      .from("profiles")
      .select("id")
      .eq("relay_external_id", externalId)
      .maybeSingle();

    let userId = existing.data?.id as string | undefined;
    let userEmail: string;
    let isNewUser = false;

    if (!userId) {
      // Synthetic address keyed on the external id — the person is identified
      // by Relay, not by an email form field.
      userEmail = `relay-${externalId}@users.examforge.app`;
      const created = await admin.auth.admin.createUser({
        email: userEmail,
        email_confirm: true,
        password: randomSecret(),
        user_metadata: {
          provider: "relay",
          relay_external_id: externalId,
          username: relayUsername,
          full_name: displayName,
        },
      });
      if (created.error) return bad("Could not link the Relay identity.", 500);
      userId = created.data.user.id;
      isNewUser = true;
      await admin.from("profiles").upsert(
        {
          id: userId,
          kind: "student",
          full_name: displayName,
          username: relayUsername,
          provider: "relay",
          relay_external_id: externalId,
        },
        { onConflict: "id" }
      );
    } else {
      const u = await admin.auth.admin.getUserById(userId);
      userEmail = u.data?.user?.email ?? `relay-${externalId}@users.examforge.app`;
    }

    // Mint a one-time sign-in token server-side, then exchange it at GoTrue's
    // JSON verify endpoint for a real session. Nothing ever redirects the
    // browser through a link — the code they typed is the only credential.
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
    });
    const actionLink = link.data?.properties?.action_link;
    if (!actionLink) return bad("Could not start a session — try again.", 500);
    const tokenHash = new URL(actionLink).searchParams.get("token");
    if (!tokenHash) return bad("Could not start a session — try again.", 500);

    const sessionRes = await fetch(`${url}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
      cache: "no-store",
    });
    const sessionBody = (await sessionRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      error?: string;
    };
    if (!sessionRes.ok || !sessionBody.access_token || !sessionBody.refresh_token) {
      console.error("[examforge:relay-verify] session exchange failed", sessionRes.status);
      return bad("Could not start a session — try again.", 502);
    }

    return ok({
      ok: true,
      session: {
        access_token: sessionBody.access_token,
        refresh_token: sessionBody.refresh_token,
      },
      next: isNewUser ? "/onboarding" : "/dash",
    });
  } catch (e) {
    console.error("[examforge:relay-verify]", e);
    return bad("Relay sign-in is unreachable right now.", 502);
  }
}
