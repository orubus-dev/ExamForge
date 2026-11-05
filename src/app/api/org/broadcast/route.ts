import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth, roleMember } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  school_id: z.string().uuid(),
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(2).max(2000),
  class_id: z.string().uuid().optional(),
  audience: z.enum(["all", "students", "teachers"]).optional(),
});

/**
 * School broadcast — delivers an inbox message to every targeted member of the
 * school (all / students / teachers / one class). Admin-only.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { school_id, title, body, class_id, audience } = parsed.data;

  const member = roleMember(auth.memberships, ["org_admin"], school_id);
  if (!member) return bad("Only the school admin can broadcast.", 403);

  const admin = supabaseAdmin();
  try {
    // Resolve targets.
    let targets: { user_id: string }[] = [];
    if (class_id) {
      const cls = await admin
        .from("classes")
        .select("id,school_id")
        .eq("id", class_id)
        .maybeSingle();
      if (!cls.data || cls.data.school_id !== school_id) {
        return bad("That class does not belong to your school.", 400);
      }
      const rows = await admin
        .from("school_members")
        .select("user_id")
        .eq("school_id", school_id)
        .eq("class_id", class_id);
      targets = (rows.data as { user_id: string }[]) ?? [];
    } else if (audience === "students" || audience === "teachers") {
      const rows = await admin
        .from("school_members")
        .select("user_id,role")
        .eq("school_id", school_id)
        .eq("role", audience === "students" ? "student" : "teacher");
      targets = (rows.data as { user_id: string }[]) ?? [];
    } else {
      const rows = await admin
        .from("school_members")
        .select("user_id")
        .eq("school_id", school_id);
      targets = (rows.data as { user_id: string }[]) ?? [];
    }

    const unique = Array.from(new Set(targets.map((t) => t.user_id)));
    if (unique.length === 0) return ok({ delivered: 0 });

    const rows = unique.map((user_id) => ({
      user_id,
      kind: "broadcast",
      title,
      body,
      payload: { school_id, class_id: class_id ?? null, from: auth.profile?.full_name ?? "School admin" },
    }));
    const ins = await admin.from("inbox_messages").insert(rows);
    if (ins.error) return bad("Could not deliver the broadcast.", 500);

    return ok({ delivered: unique.length });
  } catch (e) {
    console.error("[examforge:org-broadcast]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
