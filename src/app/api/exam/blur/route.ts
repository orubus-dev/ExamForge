import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import type { ExamSession } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({ session_id: z.string().uuid() });

/** Tab-blur beacon from the runner (visibilitychange). */
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
      .select("id,student_id,status,exam_id,tab_blurs")
      .eq("id", session_id)
      .maybeSingle();
    const session = sess.data as
      | Pick<ExamSession, "id" | "student_id" | "status" | "exam_id" | "tab_blurs">
      | null;
    if (!session) return bad("Session not found.", 404);
    if (session.student_id !== auth.user.id) return bad("This session is not yours.", 403);
    if (session.status !== "in_progress") return ok({ ok: true, ignored: true });

    const upd = await admin
      .from("exam_sessions")
      .update({ tab_blurs: (session.tab_blurs ?? 0) + 1 })
      .eq("id", session.id);
    if (upd.error) return bad("Could not log the blur.", 400);

    await admin.from("exam_events").insert({
      exam_id: session.exam_id,
      session_id: session.id,
      kind: "tab_blur",
      payload: { count: (session.tab_blurs ?? 0) + 1, at: new Date().toISOString() },
    });

    return ok({ ok: true, tab_blurs: (session.tab_blurs ?? 0) + 1 });
  } catch (e) {
    console.error("[examforge:blur]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
