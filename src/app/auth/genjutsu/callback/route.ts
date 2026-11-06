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

function clearCookies(origin: string): string[] {
  const base = `Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
    origin.startsWith("https://") ? "; Secure" : ""
  }`;
  return [`ef_gj_verifier=; ${base}`, `ef_gj_state=; ${base}`];
}

/**
 * OAuth callback (registered redirect_uri: /auth/genjutsu/callback).
 * Exchange the code (PKCE), load the identity, find or create the ExamForge
 * user, mint the session SERVER-SIDE, then hand the browser its fresh tokens
 * via a URL fragment on /auth/finish. No magic-link bounce — the fragment is
 * the standard implicit-flow shape supabase-js hydrates natively, and it never
 * reaches any server or log.
 */
export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const failRes = (msg: string) => {
    const res = fail(origin, msg);
    for (const c of clearCookies(origin)) res.headers.append("set-cookie", c);
    return res;
  };

  if (!code) return failRes("missing_code");
  if (url.searchParams.get("error")) return failRes("provider_error");

  const verifier = cookieValue(req, "ef_gj_verifier");
  const expectedState = cookieValue(req, "ef_gj_state");
  if (!verifier || !expectedState) return failRes("expired_flow");
  if (state !== expectedState) return failRes("state_mismatch");

  const clientId = process.env.GENJUTSU_CLIENT_ID;
  const clientSecret = process.env.GENJUTSU_CLIENT_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!clientId || !clientSecret || !appUrl || !anonKey) return failRes("provider_not_configured");

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
    if (!tokenRes.ok) return failRes("token_exchange_failed");
    const tokenBody = (await tokenRes.json()) as { access_token?: string };
    if (!tokenBody.access_token) return failRes("token_exchange_failed");

    // 2. Identity.
    const userRes = await fetch(USERINFO_URL, {
      headers: { authorization: `Bearer ${tokenBody.access_token}` },
      cache: "no-store",
    });
    if (!userRes.ok) return failRes("userinfo_failed");
    const info = (await userRes.json()) as UserInfo;
    if (!info?.sub) return failRes("userinfo_failed");

    // 3. Find or create the ExamForge account.
    const admin = supabaseAdmin();
    const existing = await admin
      .from("profiles")
      .select("id")
      .eq("genjutsu_sub", info.sub)
      .maybeSingle();

    let userId = existing.data?.id as string | undefined;
    let email = info.email ?? null;
    let isNewUser = false;

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
        if (alt.error) return failRes("account_link_failed");
        created = alt;
        email = fallbackEmail;
      } else if (created.error) {
        return failRes("account_link_failed");
      }
      userId = created.data.user.id;
      isNewUser = true;
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

    if (!email) return failRes("account_link_failed");

    // 4. Mint the session server-side: one-time sign-in token exchanged at
    //    GoTrue's JSON verify endpoint. The browser only ever receives its own
    //    fresh tokens — no link for the user to open.
    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    const actionLink = link.data?.properties?.action_link;
    if (!actionLink) return failRes("session_link_failed");
    const tokenHash = new URL(actionLink).searchParams.get("token");
    if (!tokenHash) return failRes("session_link_failed");

    const sessionRes = await fetch(`${appUrl}/auth/v1/verify`, {
      method: "POST",
      headers: { apikey: anonKey, "content-type": "application/json" },
      body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
      cache: "no-store",
    });
    const sessionBody = (await sessionRes.json().catch(() => ({}))) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      error?: string;
    };
    if (!sessionRes.ok || !sessionBody.access_token || !sessionBody.refresh_token) {
      console.error("[examforge:genjutsu-callback] session exchange failed", sessionRes.status);
      return failRes("session_link_failed");
    }

    // 5. Deliver via /auth/finish#<implicit-flow fragment> — supabase-js
    //    hydrates the session client-side and FinishClient hops to `next`.
    const next = isNewUser ? "/onboarding" : "/dash";
    const finish = new URL("/auth/finish", origin);
    finish.searchParams.set("next", next);
    const params = new URLSearchParams({
      access_token: sessionBody.access_token,
      refresh_token: sessionBody.refresh_token,
      expires_in: String(sessionBody.expires_in ?? 3600),
      token_type: "bearer",
    });

    const res = NextResponse.redirect(`${finish.toString()}#${params.toString()}`, 302);
    for (const c of clearCookies(origin)) res.headers.append("set-cookie", c);
    return res;
  } catch (e) {
    console.error("[examforge:genjutsu-callback]", e);
    return failRes("sign_in_failed");
  }
}

function randomSecret(): string {
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  let out = "";
  for (const b of arr) out += b.toString(16).padStart(2, "0");
  return out;
}
