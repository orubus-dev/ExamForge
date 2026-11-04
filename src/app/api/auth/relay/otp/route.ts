import { z } from "zod";
import { bad, ok, parseBody, rateGuard } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
});

/**
 * Relay OTP — step 1. Ask the Relay auth-challenge function to send a one-time
 * code to the email. Returns the challenge id for verification.
 */
export async function POST(req: Request) {
  const limited = rateGuard(req, "auth-relay-otp");
  if (limited) return limited;

  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { email } = parsed.data;

  const clientId = process.env.RELAY_CLIENT_ID;
  const clientSecret = process.env.RELAY_CLIENT_SECRET;
  const base =
    process.env.RELAY_API_BASE ||
    "https://gobwknacvpgysmgpvzqt.supabase.co/functions/v1/auth-challenge";
  if (!clientId || !clientSecret) {
    return bad("Relay sign-in is not configured yet.", 503);
  }

  try {
    const res = await fetch(`${base}/auth/otp`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        channel: "email",
        destination: email,
      }),
      cache: "no-store",
    });
    if (!res.ok) return bad("Relay could not send a code to that address.", 502);
    const data = (await res.json()) as { challenge_id?: string; id?: string };
    const challengeId = data.challenge_id ?? data.id;
    if (!challengeId) return bad("Relay did not return a challenge.", 502);
    return ok({ challenge_id: challengeId });
  } catch (e) {
    console.error("[examforge:relay-otp]", e);
    return bad("Relay sign-in is unreachable right now.", 502);
  }
}
