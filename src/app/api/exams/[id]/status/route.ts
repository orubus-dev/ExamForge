import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { examAccess } from "@/lib/examAccess";
import type { Exam } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  status: z.enum(["ready", "live", "closed", "graded"]),
});

/**
 * Status transitions with gates:
 *   draft → ready   (needs at least one question)
 *   ready → live    (the "start exam" gate from the monitor)
 *   ready|live → closed
 *   closed → graded (grading was finished)
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { status } = parsed.data;

  const admin = supabaseAdmin();
  const row = await admin.from("exams").select("*").eq("id", params.id).maybeSingle();
  const exam = row.data as Exam | null;
  if (!exam) return bad("Exam not found.", 404);
  if (!(await examAccess(exam, auth.user.id, auth.memberships))) {
    return bad("You do not have access to this exam.", 403);
  }

  const allowed: Record<string, string[]> = {
    ready: ["draft"],
    live: ["ready"],
    closed: ["ready", "live"],
    graded: ["closed"],
  };
  if (!allowed[status].includes(exam.status)) {
    return bad(`Cannot move an exam from ${exam.status} to ${status}.`, 400);
  }

  if (status === "ready") {
    const q = await admin.from("questions").select("id", { count: "exact" }).eq("exam_id", exam.id);
    if ((q.count ?? 0) < 1) {
      return bad("Add at least one question before setting the exam ready.", 400);
    }
  }

  const upd = await admin
    .from("exams")
    .update({ status })
    .eq("id", exam.id)
    .select("id,status")
    .single();
  if (upd.error) return bad("Could not update the exam.", 400);

  await admin.from("exam_events").insert({
    exam_id: exam.id,
    session_id: null,
    kind: status === "live" ? "exam_started" : `exam_${status}`,
    payload: { by: auth.user.id, from: exam.status },
  });

  return ok({ id: upd.data.id, status: upd.data.status });
}
