import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { gradeResponse, type GradeableQuestion } from "@/lib/grade";
import type { Exam, ExamSession, Question } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({ session_id: z.string().uuid() });

/**
 * Submit + auto-grade objective questions (mcq / multi / truefalse).
 * Short answers stay pending for teacher grading. When nothing is pending the
 * session goes straight to graded.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { session_id } = parsed.data;

  const admin = supabaseAdmin();
  try {
    const sess = await admin
      .from("exam_sessions")
      .select("*")
      .eq("id", session_id)
      .maybeSingle();
    const session = sess.data as ExamSession | null;
    if (!session) return bad("Session not found.", 404);
    if (session.student_id !== auth.user.id) return bad("This session is not yours.", 403);
    if (["submitted", "graded"].includes(session.status)) {
      return ok({ ok: true, already: true, status: session.status });
    }

    const now = new Date().toISOString();
    await admin
      .from("exam_sessions")
      .update({ status: "submitted", submitted_at: now, last_seen_at: now })
      .eq("id", session.id);

    const qres = await admin.from("questions").select("*").eq("exam_id", session.exam_id);
    const questions = (qres.data as Question[]) ?? [];
    const ares = await admin.from("answers").select("*").eq("session_id", session.id);
    const answers = (ares.data as { question_id: string; response: unknown }[]) ?? [];
    const byQ = new Map(answers.map((a) => [a.question_id, a.response]));

    let score = 0;
    let total = 0;
    let pending = false;

    for (const q of questions) {
      total += q.points;
      const gq: GradeableQuestion = { id: q.id, type: q.type, correct: q.correct, points: q.points };
      const outcome = gradeResponse(gq, byQ.get(q.id) ?? null);
      await admin
        .from("answers")
        .update({ correct: outcome.correct, points_awarded: outcome.points })
        .eq("session_id", session.id)
        .eq("question_id", q.id);
      score += outcome.points;
      if (outcome.correct === null) pending = true;
    }

    const finalStatus = pending ? "submitted" : "graded";
    await admin
      .from("exam_sessions")
      .update({ score, total_points: total, status: finalStatus })
      .eq("id", session.id);

    await admin.from("exam_events").insert({
      exam_id: session.exam_id,
      session_id: session.id,
      kind: "exam_submitted",
      payload: { score, total_points: total, pending },
    });

    // If every session is done, the exam itself moves to closed/graded.
    if (pending === false) {
      const examRes = await admin
        .from("exams")
        .select("status")
        .eq("id", session.exam_id)
        .maybeSingle();
      if ((examRes.data as Pick<Exam, "status"> | null)?.status === "live") {
        const left = await admin
          .from("exam_sessions")
          .select("id,status")
          .eq("exam_id", session.exam_id)
          .in("status", ["joined_waiting", "in_progress"]);
        if ((left.data ?? []).length === 0) {
          await admin.from("exams").update({ status: "closed" }).eq("id", session.exam_id);
        }
      }
    }

    return ok({ ok: true, status: finalStatus, score, total_points: total, pending });
  } catch (e) {
    console.error("[examforge:submit]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
