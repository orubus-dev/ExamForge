import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import type { ExamSession } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  session_id: z.string().uuid(),
  question_id: z.string().uuid(),
  response: z.union([
    z.string().max(4000),
    z.array(z.string().max(100)).max(8),
    z.null(),
  ]),
});

/** Autosave upsert (client fires every ~3s while answers are dirty). */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { session_id, question_id, response } = parsed.data;

  const admin = supabaseAdmin();
  try {
    const sess = await admin
      .from("exam_sessions")
      .select("id,student_id,status")
      .eq("id", session_id)
      .maybeSingle();
    const session = sess.data as Pick<ExamSession, "id" | "student_id" | "status"> | null;
    if (!session) return bad("Session not found.", 404);
    if (session.student_id !== auth.user.id) return bad("This session is not yours.", 403);
    if (!["in_progress", "joined_waiting"].includes(session.status)) {
      return bad("This attempt is closed.", 409);
    }

    const q = await admin
      .from("questions")
      .select("id,exam_id")
      .eq("id", question_id)
      .eq("exam_id", (
        await admin.from("exam_sessions").select("exam_id").eq("id", session_id).single()
      ).data?.exam_id ?? "")
      .maybeSingle();
    if (!q.data) return bad("That question is not part of this exam.", 400);

    const up = await admin.from("answers").upsert(
      { session_id, question_id, response, points_awarded: 0 },
      { onConflict: "session_id,question_id" }
    );
    if (up.error) return bad("Could not save the answer.", 400);

    await admin
      .from("exam_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", session_id);

    return ok({ ok: true, saved_at: new Date().toISOString() });
  } catch (e) {
    console.error("[examforge:save-answer]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
