import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { staffStatus } from "@/lib/permissions";

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
 * school (all / students / teachers / one class). The admin always can;
 * teachers need the message_students toggle and may only address one class.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { school_id, title, body, class_id, audience } = parsed.data;

  const staff = await staffStatus(school_id, auth.user.id, auth.memberships);
  if (!staff || (staff.isTeacher && !staff.perms.message_students)) {
    return bad("Messaging students is not enabled for your account in this school.", 403);
  }
  if (staff.isTeacher && !class_id) {
    return bad("Teachers broadcast to one class at a time — pick a class.", 403);
  }

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
      payload: {
        school_id,
        class_id: class_id ?? null,
        from: auth.profile?.full_name ?? (staff.isOrgAdmin ? "School admin" : "Your teacher"),
      },
    }));
    const ins = await admin.from("inbox_messages").insert(rows);
    if (ins.error) return bad("Could not deliver the broadcast.", 500);

    return ok({ delivered: unique.length });
  } catch (e) {
    console.error("[examforge:org-broadcast]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
