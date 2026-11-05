import { supabaseAdmin } from "@/lib/supabase/admin";
import { ok, rateGuard } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const RESERVED = new Set([
  "admin", "administrator", "support", "root", "system", "moderator",
  "examforge", "org", "school", "teacher", "student", "api", "null", "undefined",
]);

/** GET /api/auth/username?u=name — is this username claimable? */
export async function GET(req: Request) {
  const limited = rateGuard(req, "username-check");
  if (limited) return limited;

  const raw = new URL(req.url).searchParams.get("u") ?? "";
  const u = raw.trim().toLowerCase();

  if (!/^[a-z0-9_.-]{3,40}$/.test(u)) {
    return ok({ available: false, reason: "Use 3-40 letters, numbers, dots, dashes or underscores." });
  }
  if (RESERVED.has(u)) {
    return ok({ available: false, reason: "That username is reserved." });
  }

  const row = await supabaseAdmin()
    .from("profiles")
    .select("id")
    .eq("username", u)
    .maybeSingle();
  if (row.data) return ok({ available: false, reason: "That username is taken." });

  return ok({ available: true });
}
