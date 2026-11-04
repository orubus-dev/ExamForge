import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { bad, ok, parseBody, rateGuard } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  tag: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,16}$/, "Enter the Exam ID your school issued"),
  password: z.string().min(1).max(200),
});

/**
 * School-issued sign-in: the Exam ID (student_tag) maps to the synthetic
 * address <tag>@students.examforge.app. We sign in with the anon client and
 * hand the session tokens to the browser, which stores them with setSession.
 */
export async function POST(req: Request) {
  const limited = rateGuard(req, "auth-school");
  if (limited) return limited;

  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { tag, password } = parsed.data;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return bad("Auth is not configured.", 503);

  const client = createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const email = `${tag.toLowerCase()}@students.examforge.app`;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) {
    return bad("Wrong Exam ID or password.", 401);
  }
  return ok({
    session: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  });
}
