import { redirect } from "next/navigation";
import { getViewer, primaryRole } from "@/lib/session";
import { roleHome, type ViewerRole } from "@/lib/routes";
import type { ShellViewer } from "@/components/AppShell";
import type { DashData, DashExam, TeacherClass } from "@/components/dash/DashClient";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { staffStatus } from "@/lib/permissions";
import type { Exam, ExamSession, PermFlag } from "@/lib/types";
import { DEFAULT_TEACHER_PERMS } from "@/lib/types";

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

  // Effective staff flags for the dashboard UI — the same toggles the school
  // console edits. Teachers see exactly what they have been granted.
  let staffPerms: Record<PermFlag, boolean> | null = null;
  if (role === "teacher" && membership) {
    const staff = await staffStatus(membership.school_id, viewer.user.id, viewer.memberships);
    staffPerms = staff?.perms ?? { ...DEFAULT_TEACHER_PERMS };
  } else if (role === "org_admin") {
    staffPerms = {
      create_exams: true,
      publish_results: true,
      manage_question_bank: true,
      manage_classes: true,
      message_students: true,
      view_analytics: true,
      manage_students: true,
      proctor_exams: true,
    };
  }

  // Analytics for the teacher dashboard (gated by the view_analytics toggle;
  // org_admins always get it). Uses the cookie client — RLS staff reads apply.
  let analytics: DashData["analytics"] = [];
  if ((role === "teacher" || role === "org_admin") && staffPerms?.view_analytics && exams.length > 0) {
    const sesRes = await supabase
      .from("exam_sessions")
      .select("exam_id,status,score,total_points")
      .in("exam_id", exams.map((e) => e.id));
    const sessions = (sesRes.data as Pick<ExamSession, "exam_id" | "status" | "score" | "total_points">[]) ?? [];
    analytics = exams.map((e) => {
      const rows = sessions.filter((s) => s.exam_id === e.id);
      const graded = rows.filter((s) => s.status === "graded" && (s.total_points ?? 0) > 0);
      const avg =
        graded.length === 0
          ? null
          : (graded.reduce((acc, s) => acc + (s.score ?? 0) / (s.total_points || 1), 0) / graded.length) * 100;
      return {
        exam_id: e.id,
        title: e.title,
        sessions: rows.length,
        submitted: rows.filter((s) => s.status === "submitted" || s.status === "graded").length,
        avg_pct: avg,
      };
    });
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
      staffPerms,
      analytics,
    },
  };
}
