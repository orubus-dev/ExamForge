import { redirect } from "next/navigation";
import TakeRunnerClient, { type RunnerData } from "@/components/exam/TakeRunnerClient";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { currentUser } from "@/lib/api";
import type { Exam, ExamSession, Question } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** Runner question payload — correct answers and explanations never reach the browser. */
export interface RunnerQuestion {
  id: string;
  ord: number;
  type: "mcq" | "multi" | "truefalse" | "short";
  prompt: string;
  options: { key: string; text: string }[];
  points: number;
}

export default async function TakeExamPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams?: { session?: string };
}) {
  const user = await currentUser();
  if (!user) redirect("/auth");

  const admin = supabaseAdmin();
  let session: ExamSession | null = null;

  if (searchParams?.session) {
    const res = await admin
      .from("exam_sessions")
      .select("*")
      .eq("id", searchParams.session)
      .maybeSingle();
    const s = res.data as ExamSession | null;
    if (s && s.student_id === user.id && s.exam_id === params.id) session = s;
  } else {
    const res = await admin
      .from("exam_sessions")
      .select("*")
      .eq("exam_id", params.id)
      .eq("student_id", user.id)
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle();
    session = (res.data as ExamSession | null) ?? null;
  }

  if (!session) redirect(`/exam/join`);

  if (["submitted", "graded"].includes(session.status)) {
    redirect(`/results/${params.id}`);
  }
  if (session.status === "abandoned") redirect("/exam/join");

  const examRes = await admin.from("exams").select("*").eq("id", params.id).maybeSingle();
  const exam = examRes.data as Exam | null;
  if (!exam) redirect("/dash");

  // Waiting sessions go back to the lobby (which auto-enters on live).
  if (session.status === "joined_waiting" && exam.status !== "live") {
    redirect(`/exam/join?code=${encodeURIComponent(exam.invite_code)}`);
  }

  const qres = await admin
    .from("questions")
    .select("id,ord,type,prompt,options,points")
    .eq("exam_id", params.id)
    .order("ord");
  const questions: RunnerQuestion[] = ((qres.data as Question[]) ?? []).map((q) => ({
    id: q.id,
    ord: q.ord,
    type: q.type,
    prompt: q.prompt,
    options: q.options ?? [],
    points: q.points,
  }));

  // Already-saved responses so a resume restores work.
  const ares = await admin
    .from("answers")
    .select("question_id,response")
    .eq("session_id", session.id);
  const saved: Record<string, string | string[]> = {};
  for (const a of (ares.data as { question_id: string; response: unknown }[]) ?? []) {
    if (a.response === null || a.response === undefined) continue;
    saved[a.question_id] = a.response as string | string[];
  }

  const data: RunnerData = {
    exam: {
      id: exam.id,
      title: exam.title,
      subject: exam.subject,
      instructions: exam.instructions,
      invite_code: exam.invite_code,
      settings: exam.settings ?? {},
    },
    session: {
      id: session.id,
      status: session.status,
      deadline_at: session.deadline_at,
      started_at: session.started_at,
      tab_blurs: session.tab_blurs,
    },
    questions,
    savedAnswers: saved,
  };

  return <TakeRunnerClient data={data} />;
}
