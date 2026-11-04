import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import type { Exam, ExamSession, ExamSettings } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({ session_id: z.string().uuid() });

/**
 * Flip joined_waiting → in_progress and stamp started_at + deadline_at
 * (now + duration). Resuming an in_progress session returns the same deadline.
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
      return bad("already_submitted", 409);
    }
    if (session.status === "abandoned") return bad("This attempt was closed.", 409);

    if (session.status === "in_progress" && session.deadline_at) {
      return ok({ deadline_at: session.deadline_at, resumed: true });
    }

    const examRes = await admin
      .from("exams")
      .select("status,settings")
      .eq("id", session.exam_id)
      .maybeSingle();
    const exam = examRes.data as Pick<Exam, "status" | "settings"> | null;
    if (!exam) return bad("Exam not found.", 404);

    if (exam.status !== "live" && session.status === "joined_waiting") {
      return bad("not_live", 409);
    }

    const duration = (exam.settings as ExamSettings | null)?.duration_minutes ?? null;
    const now = new Date();
    const deadline = duration ? new Date(now.getTime() + duration * 60_000) : null;

    const upd = await admin
      .from("exam_sessions")
      .update({
        status: "in_progress",
        started_at: session.started_at ?? now.toISOString(),
        deadline_at: session.deadline_at ?? (deadline ? deadline.toISOString() : null),
        last_seen_at: now.toISOString(),
      })
      .eq("id", session.id)
      .select("deadline_at,started_at")
      .single();
    if (upd.error) return bad("Could not start the exam.", 400);

    await admin.from("exam_events").insert({
      exam_id: session.exam_id,
      session_id: session.id,
      kind: "session_started",
      payload: { attempt: session.attempt },
    });

    return ok({
      deadline_at: upd.data.deadline_at,
      started_at: upd.data.started_at,
      resumed: false,
    });
  } catch (e) {
    console.error("[examforge:exam-begin]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
