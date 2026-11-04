import { NextResponse } from "next/server";
import { randomHex, pkceChallenge } from "@/lib/crypto";
import { rateGuard } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const AUTHORIZE_URL = "https://genjustu.pages.dev/oauth/authorize";
const SCOPE = "identity profile:read email:read";
const VERIFIER_COOKIE = "ef_gj_verifier";
const STATE_COOKIE = "ef_gj_state";

/**
 * Start the Genjutsu OAuth 2.0 + PKCE (S256) dance.
 * Verifier + state are stashed in httpOnly cookies and validated at the callback.
 */
export async function GET(req: Request) {
  const limited = rateGuard(req, "auth-genjutsu");
  if (limited) return limited;

  const clientId = process.env.GENJUTSU_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json(
      { error: "Genjutsu sign-in is not configured yet." },
      { status: 503 }
    );
  }

  const origin = new URL(req.url).origin;
  const redirectUri = `${origin}/auth/genjutsu/callback`;
  const state = randomHex(16);
  const verifier = randomHex(48); // 96 hex chars — plenty of entropy
  const challenge = await pkceChallenge(verifier);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPE);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  const secure = origin.startsWith("https://");
  const cookieBase = `Path=/; HttpOnly; SameSite=Lax; Max-Age=600${
    secure ? "; Secure" : ""
  }`;

  const res = NextResponse.redirect(url.toString(), 302);
  res.headers.append(
    "set-cookie",
    `${VERIFIER_COOKIE}=${verifier}; ${cookieBase}`
  );
  res.headers.append("set-cookie", `${STATE_COOKIE}=${state}; ${cookieBase}`);
  return res;
}
