import { redirect } from "next/navigation";
import { getViewer, primaryRole } from "@/lib/session";
import { roleHome, type ShellViewer, type ViewerRole } from "@/components/AppShell";
import type { DashData, DashExam, TeacherClass } from "@/components/dash/DashClient";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import type { Exam } from "@/lib/types";

export interface RolePageResult {
  viewer: NonNullable<Awaited<ReturnType<typeof getViewer>>>;
  role: Exclude<ViewerRole, "independent">;
  data: DashData;
}

/**
 * Shared loader for the role dashboards. Guards that the viewer actually has
 * the role; independent users are sent to onboarding first.
 */
export async function loadRolePage(allowed: ViewerRole[]): Promise<RolePageResult> {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");

  const role = primaryRole(viewer);
  if (!role) redirect("/onboarding");
  if (!allowed.includes(role)) redirect(roleHome(role));

  const supabase = supabaseServer();
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  const membership =
    viewer.memberships.find((m) => m.role === role) ??
    viewer.memberships.find((m) => m.role === "org_admin") ??
    viewer.memberships.find((m) => m.role === "teacher") ??
    viewer.memberships[0];
  const school = viewer.schools.find((s) => s.id === membership?.school_id) ?? null;

  let exams: DashExam[] = [];
  let classes: TeacherClass[] = [];
  let counts = { members: 0, classes: 0, invites: 0 };

  if (role === "student") {
    const { data: rows } = await supabase
      .from("exams")
      .select("id,title,subject,status,invite_code,created_at")
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(20);
    exams = ((rows as Exam[]) ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      subject: e.subject,
      status: e.status,
      invite_code: e.invite_code,
      created_at: e.created_at,
    }));
  }

  if (role === "teacher" || role === "org_admin") {
    const { data: rows } = await supabase
      .from("exams")
      .select("id,title,subject,status,invite_code,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    exams = ((rows as Exam[]) ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      subject: e.subject,
      status: e.status,
      invite_code: e.invite_code,
      created_at: e.created_at,
    }));
  }

  if (membership) {
    const { data: classRows } = await supabase
      .from("classes")
      .select("id,name,short_code")
      .eq("school_id", membership.school_id)
      .order("name");
    classes = (classRows as TeacherClass[]) ?? [];

    if (role === "org_admin") {
      const [members, classCount, invites] = await Promise.all([
        supabase.from("school_members").select("id", { count: "exact" }).eq("school_id", membership.school_id),
        supabase.from("classes").select("id", { count: "exact" }).eq("school_id", membership.school_id),
        supabase.from("school_invites").select("id", { count: "exact" }).eq("school_id", membership.school_id).eq("status", "pending"),
      ]);
      counts = {
        members: members.count ?? 0,
        classes: classCount.count ?? 0,
        invites: invites.count ?? 0,
      };
    }
  }

  const shell: ShellViewer = {
    name: viewer.profile?.full_name || viewer.user.email || "you",
    role,
    schoolName: school?.name ?? null,
    unread: unreadCount(inbox),
    studentTag: viewer.profile?.student_tag ?? null,
  };

  return {
    viewer,
    role,
    data: {
      ...shell,
      kind: viewer.profile?.kind ?? "student",
      hasMemberships: viewer.memberships.length > 0,
      schoolId: membership?.school_id ?? null,
      exams,
      classes,
      counts,
    },
  };
}
