import { supabaseAdmin } from "@/lib/supabase/admin";
import { ok, rateGuard, requireAuth } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * GET /api/users/search?q=ada — find people by username or name to start a DM.
 * Usernames are the address book of ExamForge, so this is a global directory
 * search (minimum 2 chars, small payload, no emails).
 */
export async function GET(req: Request) {
  const limited = rateGuard(req, "users-search");
  if (limited) return limited;

  const auth = await requireAuth();
  if (!auth.ok) return auth.res;

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length < 2) return ok({ users: [] });

  const admin = supabaseAdmin();
  const byUsername = await admin
    .from("profiles")
    .select("id,username,full_name,kind,student_tag")
    .neq("id", auth.user.id)
    .ilike("username", `${q}%`)
    .limit(6);

  const byName = await admin
    .from("profiles")
    .select("id,username,full_name,kind,student_tag")
    .neq("id", auth.user.id)
    .ilike("full_name", `%${q}%`)
    .limit(6);

  const seen = new Set<string>();
  const users: Record<string, unknown>[] = [];
  for (const row of [...(byUsername.data ?? []), ...(byName.data ?? [])]) {
    const r = row as Record<string, unknown>;
    if (seen.has(String(r.id))) continue;
    seen.add(String(r.id));
    users.push(r);
    if (users.length >= 8) break;
  }

  return ok({ users });
}
