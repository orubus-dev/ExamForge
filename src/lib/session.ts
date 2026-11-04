import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase/server";
import type { Profile, School, SchoolMember } from "./types";

export interface Viewer {
  user: User;
  profile: Profile | null;
  memberships: SchoolMember[];
  schools: School[];
}

/**
 * Current viewer for server components: user + profile + memberships + schools.
 * All reads are RLS-covered, so the plain (cookie-authenticated) client is used.
 */
export async function getViewer(): Promise<Viewer | null> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, membersRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("school_members").select("*").eq("user_id", user.id),
  ]);

  const memberships = (membersRes.data as SchoolMember[]) ?? [];
  const schoolIds = memberships.map((m) => m.school_id);
  let schools: School[] = [];
  if (schoolIds.length > 0) {
    const schoolsRes = await supabase.from("schools").select("*").in("id", schoolIds);
    schools = (schoolsRes.data as School[]) ?? [];
  }

  return {
    user,
    profile: (profileRes.data as Profile) ?? null,
    memberships,
    schools,
  };
}

export function primaryRole(viewer: Viewer): "org_admin" | "teacher" | "student" | null {
  if (viewer.memberships.some((m) => m.role === "org_admin")) return "org_admin";
  if (viewer.memberships.some((m) => m.role === "teacher")) return "teacher";
  if (viewer.memberships.some((m) => m.role === "student")) return "student";
  if (viewer.profile?.kind === "org_admin") return "org_admin";
  if (viewer.profile?.kind === "teacher") return "teacher";
  return null;
}
