import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, rateGuard } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  challenge_id: z.string().min(6).max(200),
  code: z.string().trim().min(4).max(12),
  email: z.string().trim().toLowerCase().email().max(320),
});

function randomSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Relay OTP — step 2. Verify the code with Relay, then find or create the
 * ExamForge account keyed on relay_external_id and hand back a magic-link URL
 * that gives the browser a native Supabase session.
 */
export async function POST(req: Request) {
  const limited = rateGuard(req, "auth-relay-verify");
  if (limited) return limited;

  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { challenge_id, code, email } = parsed.data;

  const clientId = process.env.RELAY_CLIENT_ID;
  const clientSecret = process.env.RELAY_CLIENT_SECRET;
  const base =
    process.env.RELAY_API_BASE ||
    "https://gobwknacvpgysmgpvzqt.supabase.co/functions/v1/auth-challenge";
  if (!clientId || !clientSecret) {
    return bad("Relay sign-in is not configured yet.", 503);
  }

  try {
    const verifyRes = await fetch(`${base}/auth/otp/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, challenge_id, code }),
      cache: "no-store",
    });
    if (!verifyRes.ok) return bad("That code is not valid or has expired.", 401);
    const v = (await verifyRes.json()) as {
      ok?: boolean;
      token?: string;
      external_id?: string;
    };
    if (!v?.ok || !v.external_id) return bad("That code is not valid or has expired.", 401);
    const externalId = v.external_id;

    const origin = new URL(req.url).origin;
    const admin = supabaseAdmin();

    const existing = await admin
      .from("profiles")
      .select("id")
      .eq("relay_external_id", externalId)
      .maybeSingle();

    let userId = existing.data?.id as string | undefined;
    let userEmail: string = email;

    if (!userId) {
      const created = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        password: randomSecret(),
        user_metadata: { provider: "relay", relay_external_id: externalId },
      });
      if (created.error) {
        // The address may already belong to an earlier signup — fall back to a
        // unique synthetic address keyed on the external id.
        const alt = await admin.auth.admin.createUser({
          email: `relay-${externalId}@users.examforge.app`,
          email_confirm: true,
          password: randomSecret(),
          user_metadata: { provider: "relay", relay_external_id: externalId },
        });
        if (alt.error) return bad("Could not link the Relay identity.", 500);
        userId = alt.data.user.id;
        userEmail = alt.data.user.email ?? `relay-${externalId}@users.examforge.app`;
      } else {
        userId = created.data.user.id;
      }
      await admin.from("profiles").upsert(
        {
          id: userId,
          kind: "student",
          full_name: email.split("@")[0],
          provider: "relay",
          relay_external_id: externalId,
        },
        { onConflict: "id" }
      );
    } else {
      const u = await admin.auth.admin.getUserById(userId);
      userEmail = u.data?.user?.email ?? email;
    }

    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: userEmail,
      options: { redirectTo: `${origin}/auth/finish` },
    });
    const actionLink = link.data?.properties?.action_link;
    if (!actionLink) return bad("Could not start a session — try again.", 500);

    return ok({ ok: true, token: v.token ?? null, redirect_url: actionLink });
  } catch (e) {
    console.error("[examforge:relay-verify]", e);
    return bad("Relay sign-in is unreachable right now.", 502);
  }
}
