import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AppShell, type ShellViewer } from "@/components/AppShell";
import ResultsClient, {
  type ResultsData,
  type ResultsQuestion,
  type ResultsSession,
} from "@/components/results/ResultsClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { examAccess } from "@/lib/examAccess";
import type { Answer, Exam, ExamSession, Profile, Question } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ResultsPage({
  params,
}: {
  params: { examId: string };
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);

  const admin = supabaseAdmin();
  const examRes = await admin.from("exams").select("*").eq("id", params.examId).maybeSingle();
  const exam = examRes.data as Exam | null;
  if (!exam) redirect("/dash");

  const isStaff = await examAccess(exam, viewer.user.id, viewer.memberships);
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);
  const shell: ShellViewer = {
    name: viewer.profile?.full_name || viewer.user.email || "you",
    role: role ?? "independent",
    schoolName: viewer.schools.find((s) => s.id === exam.school_id)?.name ?? null,
    unread: unreadCount(inbox),
    studentTag: viewer.profile?.student_tag ?? null,
  };

  const settings = exam.settings ?? {};
  const revealed = !!settings.reveal_results;

  if (isStaff) {
    // ── Teacher / admin: full grading console ────────────────────────────────
    const [sessionsRes, qres] = await Promise.all([
      admin
        .from("exam_sessions")
        .select("*")
        .eq("exam_id", exam.id)
        .order("attempt", { ascending: false })
        .limit(300),
      admin.from("questions").select("*").eq("exam_id", exam.id).order("ord"),
    ]);
    const sessions = (sessionsRes.data as ExamSession[]) ?? [];
    const questions = (qres.data as Question[]) ?? [];

    const ares = await admin
      .from("answers")
      .select("*")
      .in(
        "session_id",
        sessions.length > 0 ? sessions.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"]
      );
    const answers = (ares.data as Answer[]) ?? [];

    const studentIds = Array.from(new Set(sessions.map((s) => s.student_id)));
    let students: Profile[] = [];
    if (studentIds.length > 0) {
      const prof = await admin.from("profiles").select("*").in("id", studentIds);
      students = (prof.data as Profile[]) ?? [];
    }

    const data: ResultsData = {
      mode: "teacher",
      exam: {
        id: exam.id,
        title: exam.title,
        status: exam.status,
        invite_code: exam.invite_code,
        reveal_results: revealed,
      },
      questions: questions.map((q) => ({
        id: q.id,
        ord: q.ord,
        type: q.type,
        prompt: q.prompt,
        options: q.options ?? [],
        correct: q.correct ?? [],
        points: q.points,
      })),
      sessions: sessions.map((s) => {
        const p = students.find((x) => x.id === s.student_id);
        const mine = answers.filter((a) => a.session_id === s.id);
        return {
          id: s.id,
          student_name: p?.full_name || p?.student_tag || "Student",
          student_tag: p?.student_tag ?? null,
          status: s.status,
          score: s.score,
          total_points: s.total_points || questions.reduce((t, q) => t + q.points, 0),
          tab_blurs: s.tab_blurs,
          attempt: s.attempt,
          submitted_at: s.submitted_at,
          answers: mine.map((a) => ({
            question_id: a.question_id,
            response: a.response,
            correct: a.correct,
            points_awarded: a.points_awarded,
          })),
        };
      }),
    };

    return (
      <AppShell viewer={shell}>
        <Link
          href="/exams"
          className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden /> All exams
        </Link>
        <ResultsClient data={data} />
      </AppShell>
    );
  }

  // ── Student: own result, only when revealed ────────────────────────────────
  const sessRes = await admin
    .from("exam_sessions")
    .select("*")
    .eq("exam_id", exam.id)
    .eq("student_id", viewer.user.id)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  const session = sessRes.data as ExamSession | null;

  if (!session) redirect("/dash");

  const qres = await admin.from("questions").select("*").eq("exam_id", exam.id).order("ord");
  const questions = (qres.data as Question[]) ?? [];
  const ares = await admin.from("answers").select("*").eq("session_id", session.id);
  const answers = (ares.data as Answer[]) ?? [];

  const canSee =
    revealed && (session.status === "graded" || session.status === "submitted");

  const data: ResultsData = {
    mode: "student",
    exam: {
      id: exam.id,
      title: exam.title,
      status: exam.status,
      invite_code: exam.invite_code,
      reveal_results: revealed,
    },
    questions: canSee
      ? questions.map((q) => ({
          id: q.id,
          ord: q.ord,
          type: q.type,
          prompt: q.prompt,
          options: q.options ?? [],
          correct: q.correct ?? [],
          points: q.points,
        }))
      : questions.map((q) => ({
          id: q.id,
          ord: q.ord,
          type: q.type,
          prompt: "",
          options: [],
          correct: [],
          points: q.points,
        })),
    sessions: [
      {
        id: session.id,
        student_name: viewer.profile?.full_name || "You",
        student_tag: viewer.profile?.student_tag,
        status: session.status,
        score: session.score,
        total_points: session.total_points || questions.reduce((t, q) => t + q.points, 0),
        tab_blurs: session.tab_blurs,
        attempt: session.attempt,
        submitted_at: session.submitted_at,
        answers: canSee
          ? answers.map((a) => ({
              question_id: a.question_id,
              response: a.response,
              correct: a.correct,
              points_awarded: a.points_awarded,
            }))
          : [],
      } as ResultsSession,
    ],
    canSee,
  };

  return (
    <AppShell viewer={shell}>
      <Link
        href="/dash"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden /> Dashboard
      </Link>
      <ResultsClient data={data} />
    </AppShell>
  );
}
