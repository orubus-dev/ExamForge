import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const TOKEN_URL =
  "https://qoasxhowgeszjvulltxa.supabase.co/functions/v1/oauth-token";
const USERINFO_URL =
  "https://qoasxhowgeszjvulltxa.supabase.co/functions/v1/oauth-userinfo";

interface UserInfo {
  sub: string;
  username?: string | null;
  email?: string | null;
}

function cookieValue(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function fail(origin: string, message: string) {
  const url = new URL("/auth", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url.toString(), 302);
}

/**
 * OAuth callback: exchange the code (PKCE), load the identity, find or create
 * the ExamForge user, then bounce through a Supabase magic link so the browser
 * ends up with a first-class session (detectSessionInUrl picks it up).
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  if (!code) return fail(origin, "missing_code");
  if (url.searchParams.get("error")) return fail(origin, "provider_error");

  const verifier = cookieValue(req, "ef_gj_verifier");
  const expectedState = cookieValue(req, "ef_gj_state");
  if (!verifier || !expectedState) return fail(origin, "expired_flow");
  if (state !== expectedState) return fail(origin, "state_mismatch");

  const clientId = process.env.GENJUTSU_CLIENT_ID;
  const clientSecret = process.env.GENJUTSU_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail(origin, "provider_not_configured");

  try {
    // 1. Token exchange (PKCE verifier proves possession).
    const tokenRes = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        redirect_uri: `${origin}/auth/genjutsu/callback`,
      }),
      cache: "no-store",
    });
    if (!tokenRes.ok) return fail(origin, "token_exchange_failed");
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenBody.access_token) return fail(origin, "token_exchange_failed");

    // 2. Identity.
    const userRes = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${tokenBody.access_token}` },
      cache: "no-store",
    });
    if (!userRes.ok) return fail(origin, "userinfo_failed");
    const info = (await userRes.json()) as UserInfo;
    if (!info?.sub) return fail(origin, "userinfo_failed");

    // 3. Find or create the ExamForge account.
    const admin = supabaseAdmin();
    const existing = await admin
      .from("profiles")
      .select("id")
      .eq("genjutsu_sub", info.sub)
      .maybeSingle();

    let userId = existing.data?.id as string | undefined;
    let email = info.email ?? null;

    if (!userId) {
      const fallbackEmail = `genjutsu-${info.sub}@users.examforge.app`;
      let created = await admin.auth.admin.createUser({
        email: email || fallbackEmail,
        email_confirm: true,
        password: randomSecret(),
        user_metadata: {
          provider: "genjutsu",
          genjutsu_sub: info.sub,
          username: info.username ?? null,
          full_name: info.username ?? null,
        },
      });
      if (created.error && email) {
        // Email already registered by an earlier signup — fall back to a
        // unique synthetic address so the OAuth identity still links.
        const alt = await admin.auth.admin.createUser({
          email: fallbackEmail,
          email_confirm: true,
          password: randomSecret(),
          user_metadata: {
            provider: "genjutsu",
            genjutsu_sub: info.sub,
            username: info.username ?? null,
            full_name: info.username ?? null,
          },
        });
        if (alt.error) return fail(origin, "account_link_failed");
        created = alt;
        email = fallbackEmail;
      } else if (created.error) {
        return fail(origin, "account_link_failed");
      }
      userId = created.data.user.id;
      await admin.from("profiles").upsert(
        {
          id: userId,
          kind: "student",
          full_name: info.username ?? "Genjutsu user",
          username: info.username ?? null,
          provider: "genjutsu",
          genjutsu_sub: info.sub,
        },
        { onConflict: "id" }
      );
    } else {
      const u = await admin.auth.admin.getUserById(userId);
      email = u.data?.user?.email ?? email ?? `genjutsu-${info.sub}@users.examforge.app`;
    }

    if (!email) return fail(origin, "account_link_failed");

    // 4. Magic link → browser gets a native session (detectSessionInUrl).
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: `${origin}/auth/finish` },
    });
    const actionLink = link.data?.properties?.action_link;
    if (!actionLink) return fail(origin, "session_link_failed");

    const res = NextResponse.redirect(actionLink, 302);
    const secure = origin.startsWith("https://");
    const clear = `Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
      secure ? "; Secure" : ""
    }`;
    res.headers.append("set-cookie", `ef_gj_verifier=; ${clear}`);
    res.headers.append("set-cookie", `ef_gj_state=; ${clear}`);
    return res;
  } catch (e) {
    console.error("[examforge:genjutsu-callback]", e);
    return fail(origin, "sign_in_failed");
  }
}

function randomSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}
