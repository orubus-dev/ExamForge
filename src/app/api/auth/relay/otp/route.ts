import { z } from "zod";
import { bad, ok, parseBody, rateGuard } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  username: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9_.-]+$/, "Usernames are letters, numbers, dots, dashes"),
});

/**
 * Relay OTP — step 1. Ask the Relay auth-challenge function to resolve the
 * username and send a one-time code to that person (their Relay channel).
 * Returns the challenge id for verification.
 */
export async function POST(req: Request) {
  const limited = rateGuard(req, "auth-relay-otp");
  if (limited) return limited;

  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { username } = parsed.data;

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
        username,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      challenge_id?: string;
      destination_hint?: string;
      error?: string;
    };
    if (!res.ok || !data.challenge_id) {
      return bad(data.error ?? "Relay could not send a code right now.", res.status === 401 ? 502 : res.status || 502);
    }
    return ok({ challenge_id: data.challenge_id, destination_hint: data.destination_hint ?? null });
  } catch (e) {
    console.error("[examforge:relay-otp]", e);
    return bad("Relay sign-in is unreachable right now.", 502);
  }
}
