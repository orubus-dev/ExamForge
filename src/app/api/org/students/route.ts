import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { staffStatus } from "@/lib/permissions";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  school_id: z.string().uuid(),
  full_name: z.string().trim().min(2).max(120),
  class_id: z.string().uuid().optional(),
  password: z.string().min(6).max(200),
});

/**
 * Create a school-issued student account:
 *  1. claim a readable Exam ID (tag) via the claim_student_tag RPC
 *  2. create the auth user with a synthetic <tag>@students.examforge.app email
 *  3. upsert the profile + school membership (with class)
 *
 * Allowed for the school admin always, and for teachers the school has
 * explicitly granted the manage_students flag (the "Manage students" toggle).
 */

function nameBase(fullName: string): string {
  const first = fullName.trim().split(/\s+/)[0] ?? "stu";
  return (first.toUpperCase().replace(/[^A-Z]/g, "") + "STU").slice(0, 4);
}

/**
 * Create a school-issued student account:
 *  1. claim a readable Exam ID (tag) via the claim_student_tag RPC
 *  2. create the auth user with a synthetic <tag>@students.examforge.app email
 *  3. upsert the profile + school membership (with class)
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { school_id, full_name, class_id, password } = parsed.data;

  // Admin always; teachers only with the manage_students toggle. Enforced —
  // flipping the toggle in the school console changes this immediately.
  const staff = await staffStatus(school_id, auth.user.id, auth.memberships);
  if (!staff || (!staff.isOrgAdmin && !(staff.isTeacher && staff.perms.manage_students))) {
    return bad("Student management is not enabled for your account in this school.", 403);
  }

  const admin = supabaseAdmin();
  try {
    const school = await admin
      .from("schools")
      .select("short_code")
      .eq("id", school_id)
      .maybeSingle();
    if (!school.data) return bad("School not found.", 404);

    let classShort = "GEN";
    if (class_id) {
      const cls = await admin
        .from("classes")
        .select("short_code,school_id")
        .eq("id", class_id)
        .maybeSingle();
      if (!cls.data || cls.data.school_id !== school_id) {
        return bad("That class does not belong to your school.", 400);
      }
      classShort = String(cls.data.short_code ?? "GEN").toUpperCase().slice(0, 3);
    }

    const rpc = await admin.rpc("claim_student_tag", {
      school: String(school.data.short_code).toUpperCase().slice(0, 3),
      class: classShort,
      name: nameBase(full_name),
    });
    if (rpc.error || !rpc.data) {
      return bad("Could not allocate an Exam ID — try again.", 500);
    }
    const tag = String(rpc.data).toUpperCase();
    const email = `${tag.toLowerCase()}@students.examforge.app`;

    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      password,
      user_metadata: {
        provider: "school",
        kind: "student",
        full_name,
        student_tag: tag,
      },
    });
    if (created.error) return bad("Could not create the account — the name or ID may clash.", 400);
    const userId = created.data.user.id;

    const prof = await admin.from("profiles").upsert(
      {
        id: userId,
        kind: "student",
        full_name,
        provider: "school",
        student_tag: tag,
      },
      { onConflict: "id" }
    );
    if (prof.error) return bad("Account created but the profile failed — contact support.", 500);

    const mem = await admin.from("school_members").insert({
      school_id,
      user_id: userId,
      role: "student",
      class_id: class_id ?? null,
    });
    if (mem.error) return bad("Account created but joining the school failed.", 500);

    await admin.from("inbox_messages").insert({
      user_id: userId,
      kind: "welcome",
      title: "Welcome to ExamForge",
      body: `Your Exam ID is ${tag}. Sign in with it and the password your school gave you.`,
      payload: { tag },
    });

    // Notify the creating staff member with the issued credentials so they can
    // hand them over — the password is shown once, right in the modal.
    if (auth.user.id !== userId) {
      await admin.from("inbox_messages").insert({
        user_id: auth.user.id,
        kind: "student_created",
        title: `Student account created — ${full_name}`,
        body: `Exam ID ${tag}. Temporary password: ${password}. Share it securely; the student should change it after first sign-in.`,
        payload: { tag, school_id },
      });
    }

    return ok({ tag, user_id: userId, temp_password: password });
  } catch (e) {
    console.error("[examforge:org-students]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
