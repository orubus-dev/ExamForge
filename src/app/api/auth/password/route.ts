import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, rateGuard } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  identifier: z.string().trim().min(2).max(320),
  password: z.string().min(1).max(200),
});

/**
 * Username-or-email password sign-in. Usernames live in profiles; resolve a
 * non-email identifier to the account's real email, then sign in through the
 * anon GoTrue client and hand the session back to the browser.
 */
export async function POST(req: Request) {
  const limited = rateGuard(req, "auth-password");
  if (limited) return limited;

  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { identifier, password } = parsed.data;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return bad("Auth is not configured.", 503);

  const isEmail = identifier.includes("@");
  let email = identifier.toLowerCase();

  if (!isEmail) {
    if (!/^[a-z0-9_.-]{2,40}$/.test(email)) return bad("Wrong username or password.", 401);
    const admin = supabaseAdmin();
    const row = await admin
      .from("profiles")
      .select("id")
      .eq("username", email)
      .maybeSingle();
    const profileId = row.data?.id as string | undefined;
    if (!profileId) return bad("Wrong username or password.", 401);
    const user = await admin.auth.admin.getUserById(profileId);
    const realEmail = user.data?.user?.email;
    if (!realEmail) return bad("Wrong username or password.", 401);
    email = realEmail;
  }

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return bad("Wrong username or password.", 401);
  }
  return ok({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
}
