import { roleMember } from "./api";
import type { Exam, SchoolMember } from "./types";

/**
 * Owner (created_by) or the school's org_admin can act on an exam.
 * Plain function (no request access) so route files can import it safely.
 */
export async function examAccess(
  exam: Pick<Exam, "created_by" | "school_id">,
  userId: string,
  memberships: SchoolMember[]
): Promise<boolean> {
  if (exam.created_by === userId) return true;
  if (!exam.school_id) return false;
  return !!roleMember(memberships, ["org_admin"], exam.school_id);
}
