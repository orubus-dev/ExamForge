import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { examAccess } from "@/lib/examAccess";
import type { Exam } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({ exam_id: z.string().uuid() });

/**
 * Publish results: flips reveal_results on and marks the exam graded so
 * students can see their own breakdown in /results.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { exam_id } = parsed.data;

  const admin = supabaseAdmin();
  const row = await admin.from("exams").select("*").eq("id", exam_id).maybeSingle();
  const exam = row.data as Exam | null;
  if (!exam) return bad("Exam not found.", 404);
  if (!(await examAccess(exam, auth.user.id, auth.memberships))) {
    return bad("Only the exam owner or the school admin can publish results.", 403);
  }
  if (!["closed", "graded", "live"].includes(exam.status)) {
    return bad("Results publish after submissions.", 400);
  }

  const upd = await admin
    .from("exams")
    .update({
      status: "graded",
      settings: { ...(exam.settings ?? {}), reveal_results: true },
    })
    .eq("id", exam.id);
  if (upd.error) return bad("Could not publish results.", 400);

  await admin.from("exam_events").insert({
    exam_id: exam.id,
    session_id: null,
    kind: "results_published",
    payload: { by: auth.user.id },
  });

  return ok({ ok: true, status: "graded", reveal_results: true });
}
