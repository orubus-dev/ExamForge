import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import SchoolClient, {
  type SchoolClassRow,
  type SchoolData,
  type SchoolEventRow,
  type SchoolMemberRow,
} from "@/components/school/SchoolClient";
import { getViewer } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import type {
  Exam,
  ExamSession,
  Profile,
  SchoolInvite,
  TeacherPermissions,
} from "@/lib/types";
import type { SchoolExamStat } from "@/components/school/SchoolClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SchoolPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");

  const supabase = supabaseServer();
  const orgMembership = viewer.memberships.find((m) => m.role === "org_admin");
  const school = viewer.schools.find((s) => s.id === orgMembership?.school_id) ?? null;

  // No school yet → the dedicated creation flow.
  if (!school) redirect("/school/new");

  let classes: SchoolClassRow[] = [];
  let members: SchoolMemberRow[] = [];
  let invites: SchoolInvite[] = [];
  let events: SchoolEventRow[] = [];
  let permsByTeacher: SchoolData["permsByTeacher"] = {};
  let examStats: SchoolExamStat[] = [];

  if (school) {
    const [classesRes, membersRes, invitesRes] = await Promise.all([
      supabase.from("classes").select("*").eq("school_id", school.id).order("name"),
      supabase.from("school_members").select("*").eq("school_id", school.id),
      supabase
        .from("school_invites")
        .select("*")
        .eq("school_id", school.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    classes = (classesRes.data as SchoolClassRow[]) ?? [];
    invites = (invitesRes.data as SchoolInvite[]) ?? [];

    const memberRows = membersRes.data ?? [];
    const ids = Array.from(new Set(memberRows.map((m) => m.user_id)));
    let profiles: Profile[] = [];
    if (ids.length > 0) {
      const profRes = await supabase.from("profiles").select("*").in("id", ids);
      profiles = (profRes.data as Profile[]) ?? [];
    }
    members = memberRows.map((m) => {
      const p = profiles.find((x) => x.id === m.user_id);
      return {
        user_id: m.user_id,
        role: m.role,
        class_id: m.class_id,
        full_name: p?.full_name ?? "",
        username: p?.username ?? null,
        student_tag: p?.student_tag ?? null,
      };
    });

    // Saved teacher permission flags — the Permissions editor must show the
    // teacher's real current toggles, not defaults.
    const tpRes = await supabase
      .from("teacher_permissions")
      .select("*")
      .eq("school_id", school.id);
    for (const tp of (tpRes.data as TeacherPermissions[]) ?? []) {
      permsByTeacher[tp.teacher_id] = {
        create_exams: tp.create_exams,
        publish_results: tp.publish_results,
        manage_question_bank: tp.manage_question_bank,
        manage_classes: tp.manage_classes,
        message_students: tp.message_students,
        view_analytics: tp.view_analytics,
        manage_students: tp.manage_students,
        proctor_exams: tp.proctor_exams,
      };
    }

    // Recent exam events across the school's exams (staff RLS read)
    if (members.some((m) => m.role === "org_admin")) {
      const examsRes = await supabase
        .from("exams")
        .select("id,title,status")
        .eq("school_id", school.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const examList = (examsRes.data as Pick<Exam, "id" | "title" | "status">[]) ?? [];
      if (examList.length > 0) {
        const [evRes, sesRes] = await Promise.all([
          supabase
            .from("exam_events")
            .select("id,exam_id,kind,at")
            .in("exam_id", examList.map((e) => e.id))
            .order("at", { ascending: false })
            .limit(30),
          supabase
            .from("exam_sessions")
            .select("exam_id,status,score,total_points")
            .in("exam_id", examList.map((e) => e.id)),
        ]);
        events = ((evRes.data as { id: number; exam_id: string; kind: string; at: string }[]) ?? []).map(
          (ev) => ({
            id: ev.id,
            kind: ev.kind,
            exam_title: examList.find((e) => e.id === ev.exam_id)?.title ?? null,
            at: ev.at,
          })
        );

        const sessions = (sesRes.data as Pick<ExamSession, "exam_id" | "status" | "score" | "total_points">[]) ?? [];
        examStats = examList.map((e) => {
          const rows = sessions.filter((s) => s.exam_id === e.id);
          const submitted = rows.filter(
            (s) => s.status === "submitted" || s.status === "graded"
          );
          const graded = rows.filter((s) => s.status === "graded");
          const withTotal = graded.filter((s) => (s.total_points ?? 0) > 0);
          const avg =
            withTotal.length === 0
              ? null
              : withTotal.reduce((acc, s) => acc + (s.score ?? 0) / (s.total_points || 1), 0) /
                withTotal.length;
          return {
            exam_id: e.id,
            title: e.title,
            status: e.status,
            sessions: rows.length,
            submitted: submitted.length,
            graded: graded.length,
            avg_pct: avg === null ? null : avg * 100,
          };
        });
      }
    }
  }

  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  const data: SchoolData = {
    myUserId: viewer.user.id,
    school: school
      ? {
          id: school.id,
          name: school.name,
          short_code: school.short_code,
          kind: school.kind,
          plan: school.plan,
        }
      : null,
    classes,
    members,
    invites,
    events,
    permsByTeacher,
    examStats,
  };

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role: orgMembership ? "org_admin" : viewer.profile?.kind === "teacher" ? "teacher" : "student",
        schoolName: school?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">School console</h1>
      </div>
      <SchoolClient {...data} />
    </AppShell>
  );
}
