import { supabaseAdmin } from "./supabase/admin";
import type { SchoolMember } from "./types";
import { DEFAULT_TEACHER_PERMS, PERM_KEYS, type PermFlag } from "./types";

export { DEFAULT_TEACHER_PERMS, PERM_KEYS };
export type { PermFlag };

export interface StaffStatus {
  isOrgAdmin: boolean;
  isTeacher: boolean;
  /** Effective flags — org_admins are always all-true. */
  perms: Record<PermFlag, boolean>;
}

const ALL_TRUE: Record<PermFlag, boolean> = {
  create_exams: true,
  publish_results: true,
  manage_question_bank: true,
  manage_classes: true,
  message_students: true,
  view_analytics: true,
  manage_students: true,
  proctor_exams: true,
};

/**
 * Resolve the caller's staff standing in a school. Returns null for students
 * and non-members. Server-only (service-role lookup of teacher_permissions —
 * the flags must be readable for authorization even if a future RLS tighten
 * blocks direct client reads).
 */
export async function staffStatus(
  schoolId: string,
  userId: string,
  memberships: SchoolMember[]
): Promise<StaffStatus | null> {
  const member = memberships.find((m) => m.school_id === schoolId);
  if (!member) return null;

  if (member.role === "org_admin") {
    return { isOrgAdmin: true, isTeacher: false, perms: ALL_TRUE };
  }
  if (member.role !== "teacher") return null;

  const row = await supabaseAdmin()
    .from("teacher_permissions")
    .select(PERM_KEYS.join(","))
    .eq("school_id", schoolId)
    .eq("teacher_id", userId)
    .maybeSingle();

  const perms: Record<PermFlag, boolean> = { ...DEFAULT_TEACHER_PERMS };
  if (row.data) {
    const rec = row.data as unknown as Record<string, unknown>;
    for (const k of PERM_KEYS) {
      const v = rec[k];
      if (typeof v === "boolean") perms[k] = v;
    }
  }
  return { isOrgAdmin: false, isTeacher: true, perms };
}

/** org_admin always passes; a teacher passes only with the specific flag. */
export async function staffCan(
  schoolId: string | null | undefined,
  flag: PermFlag,
  userId: string,
  memberships: SchoolMember[]
): Promise<boolean> {
  if (!schoolId) return false;
  const staff = await staffStatus(schoolId, userId, memberships);
  return !!staff && staff.perms[flag];
}
