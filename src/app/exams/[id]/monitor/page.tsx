import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import MonitorClient, { type MonitorData } from "@/components/exams/MonitorClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { examAccess } from "@/lib/examAccess";
import type { Exam, ExamSession, Profile, Question } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function MonitorPage({
  params,
}: {
  params: { id: string };
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  if (role !== "teacher" && role !== "org_admin") redirect("/dash");

  const admin = supabaseAdmin();
  const row = await admin.from("exams").select("*").eq("id", params.id).maybeSingle();
  const exam = row.data as Exam | null;
  if (!exam || !(await examAccess(exam, viewer.user.id, viewer.memberships))) {
    redirect("/exams");
  }

  const [sessionsRes, qres] = await Promise.all([
    admin
      .from("exam_sessions")
      .select("*")
      .eq("exam_id", exam!.id)
      .order("attempt", { ascending: false })
      .limit(300),
    admin.from("questions").select("id,points").eq("exam_id", exam!.id),
  ]);
  const sessions = (sessionsRes.data as ExamSession[]) ?? [];
  const questions = (qres.data as Pick<Question, "id" | "points">[]) ?? [];

  const studentIds = Array.from(new Set(sessions.map((s) => s.student_id)));
  let students: { id: string; full_name: string; student_tag: string | null }[] = [];
  if (studentIds.length > 0) {
    const prof = await admin
      .from("profiles")
      .select("id,full_name,student_tag")
      .in("id", studentIds);
    students = ((prof.data as Profile[]) ?? []).map((p) => ({
      id: p.id,
      full_name: p.full_name,
      student_tag: p.student_tag,
    }));
  }

  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);
  const data: MonitorData = {
    exam: {
      id: exam!.id,
      title: exam!.title,
      status: exam!.status,
      invite_code: exam!.invite_code,
      settings: exam!.settings ?? {},
    },
    questionCount: questions.length,
    totalPoints: questions.reduce((s, q) => s + q.points, 0),
    sessions: sessions.map((s) => ({
      id: s.id,
      student_id: s.student_id,
      student_name:
        students.find((x) => x.id === s.student_id)?.full_name ??
        students.find((x) => x.id === s.student_id)?.student_tag ??
        "Student",
      status: s.status,
      started_at: s.started_at,
      deadline_at: s.deadline_at,
      submitted_at: s.submitted_at,
      score: s.score,
      total_points: s.total_points,
      tab_blurs: s.tab_blurs,
      attempt: s.attempt,
    })),
  };

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role,
        schoolName: viewer.schools.find((s) => s.id === exam!.school_id)?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <Link
        href="/exams"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden /> All exams
      </Link>
      <MonitorClient data={data} />
    </AppShell>
  );
}
