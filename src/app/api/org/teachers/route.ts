import { z } from "zod";
import { randomHex } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth, roleMember } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const PERM_KEYS = [
  "create_exams",
  "publish_results",
  "manage_question_bank",
  "manage_classes",
  "message_students",
  "view_analytics",
  "manage_students",
  "proctor_exams",
] as const;

const Perms = z.object(
  Object.fromEntries(PERM_KEYS.map((k) => [k, z.boolean()])) as Record<
    (typeof PERM_KEYS)[number],
    z.ZodBoolean
  >
);

const InviteBody = z.object({
  school_id: z.string().uuid(),
  username_or_email: z.string().trim().min(3).max(200),
  permissions: Perms.default({
    create_exams: true,
    publish_results: false,
    manage_question_bank: false,
    manage_classes: false,
    message_students: true,
    view_analytics: false,
    manage_students: false,
    proctor_exams: false,
  }),
});

const PatchBody = z.object({
  school_id: z.string().uuid(),
  teacher_id: z.string().uuid(),
  permissions: Perms,
});

async function writePerms(
  admin: ReturnType<typeof supabaseAdmin>,
  schoolId: string,
  teacherId: string,
  perms: Record<string, boolean>
) {
  const row: Record<string, unknown> = { school_id: schoolId, teacher_id: teacherId };
  for (const k of PERM_KEYS) row[k] = perms[k] ?? false;
  await admin.from("teacher_permissions").upsert(row, { onConflict: "school_id,teacher_id" });
}

/**
 * Invite a teacher. If they already have an ExamForge account (matched by
 * username) they're added immediately with the given permissions; otherwise a
 * pending invite lands in their inbox.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, InviteBody);
  if (!parsed.data) return parsed.res;
  const { school_id, username_or_email, permissions } = parsed.data;

  const member = roleMember(auth.memberships, ["org_admin"], school_id);
  if (!member) return bad("Only the school admin can invite teachers.", 403);

  const admin = supabaseAdmin();
  try {
    const prof = await admin
      .from("profiles")
      .select("id,kind")
      .ilike("username", username_or_email)
      .limit(1)
      .maybeSingle();

    if (prof.data?.id) {
      const already = await admin
        .from("school_members")
        .select("id")
        .eq("school_id", school_id)
        .eq("user_id", prof.data.id)
        .maybeSingle();
      if (already.data) return bad("That person is already a member of your school.", 409);

      const ins = await admin
        .from("school_members")
        .insert({ school_id, user_id: prof.data.id, role: "teacher", class_id: null });
      if (ins.error) return bad("Could not add the teacher.", 400);

      await writePerms(admin, school_id, prof.data.id, permissions ?? {});
      await admin.from("profiles").update({ kind: "teacher" }).eq("id", prof.data.id);
      await admin.from("inbox_messages").insert({
        user_id: prof.data.id,
        kind: "school_joined",
        title: "You've been added to a school",
        body: "You can now create and run exams for them.",
        payload: { school_id },
      });
      return ok({ mode: "joined" });
    }

    const isEmail = username_or_email.includes("@") && !username_or_email.includes(" ");
    const ins = await admin
      .from("school_invites")
      .insert({
        school_id,
        kind: "teacher_invite",
        role: "teacher",
        email: isEmail ? username_or_email.toLowerCase() : null,
        username: isEmail ? null : username_or_email,
        class_id: null,
        token: randomHex(16),
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        created_by: auth.user.id,
      })
      .select("id")
      .single();
    if (ins.error) return bad("Could not create the invite.", 400);

    return ok({ mode: "invited", invite_id: ins.data.id });
  } catch (e) {
    console.error("[examforge:org-teachers]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}

/** org_admin only: update a teacher's permission toggles. */
export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, PatchBody);
  if (!parsed.data) return parsed.res;
  const { school_id, teacher_id, permissions } = parsed.data;

  const member = roleMember(auth.memberships, ["org_admin"], school_id);
  if (!member) return bad("Only the school admin can manage permissions.", 403);

  try {
    const staff = await supabaseAdmin()
      .from("school_members")
      .select("id")
      .eq("school_id", school_id)
      .eq("user_id", teacher_id)
      .in("role", ["teacher", "org_admin"])
      .maybeSingle();
    if (!staff.data) return bad("That teacher is not part of your school.", 404);

    await writePerms(supabaseAdmin(), school_id, teacher_id, permissions);
    return ok({ ok: true });
  } catch (e) {
    console.error("[examforge:org-teachers-patch]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
