import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { examAccess } from "@/lib/examAccess";
import type { Exam, ExamSession, Question } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  session_id: z.string().uuid(),
  grades: z
    .array(
      z.object({
        question_id: z.string().uuid(),
        points_awarded: z.number().int().min(0).max(100),
        correct: z.boolean(),
      })
    )
    .min(1)
    .max(300),
});

/** Teacher grading of short answers (and any manual overrides). */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { session_id, grades } = parsed.data;

  const admin = supabaseAdmin();
  try {
    const sess = await admin
      .from("exam_sessions")
      .select("id,exam_id,status")
      .eq("id", session_id)
      .maybeSingle();
    const session = sess.data as Pick<ExamSession, "id" | "exam_id" | "status"> | null;
    if (!session) return bad("Session not found.", 404);

    const examRes = await admin.from("exams").select("*").eq("id", session.exam_id).maybeSingle();
    const exam = examRes.data as Exam | null;
    if (!exam) return bad("Exam not found.", 404);
    if (!(await examAccess(exam, auth.user.id, auth.memberships))) {
      return bad("Only the exam owner or the school admin can grade.", 403);
    }
    if (!["submitted", "graded"].includes(session.status)) {
      return bad("That attempt has not been submitted yet.", 400);
    }

    const qres = await admin
      .from("questions")
      .select("id,points")
      .eq("exam_id", session.exam_id);
    const questions = (qres.data as Pick<Question, "id" | "points">[]) ?? [];
    const maxById = new Map(questions.map((q) => [q.id, q.points]));

    for (const g of grades) {
      const max = maxById.get(g.question_id);
      if (max === undefined) continue; // not a question of this exam
      const clamped = Math.min(max, Math.max(0, g.points_awarded));
      await admin
        .from("answers")
        .update({ points_awarded: clamped, correct: g.correct })
        .eq("session_id", session_id)
        .eq("question_id", g.question_id);
    }

    // Recompute the session total.
    const ares = await admin
      .from("answers")
      .select("points_awarded,correct")
      .eq("session_id", session_id);
    const answers = (ares.data as { points_awarded: number; correct: boolean | null }[]) ?? [];
    const score = answers.reduce((s, a) => s + (a.points_awarded ?? 0), 0);
    const pending = answers.some((a) => a.correct === null || a.correct === undefined);

    const status = pending ? "submitted" : "graded";
    await admin
      .from("exam_sessions")
      .update({ score, status })
      .eq("id", session_id);

    await admin.from("exam_events").insert({
      exam_id: session.exam_id,
      session_id,
      kind: "session_graded",
      payload: { by: auth.user.id, score },
    });

    return ok({ ok: true, score, status, pending });
  } catch (e) {
    console.error("[examforge:grade]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
