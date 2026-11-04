import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { examAccess } from "@/lib/examAccess";
import { hashPin } from "@/lib/crypto";
import type { Exam, ExamSession, ExamSettings } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const PatchBody = z.object({
  title: z.string().trim().min(2).max(200).optional(),
  subject: z.string().trim().max(120).optional(),
  class_id: z.string().uuid().nullable().optional(),
  instructions: z.string().max(4000).optional(),
  settings: z
    .object({
      duration_minutes: z.number().int().min(1).max(600).nullable().optional(),
      start_window_end: z.string().datetime({ offset: true }).nullable().optional(),
      shuffle_questions: z.boolean().optional(),
      shuffle_options: z.boolean().optional(),
      one_attempt: z.boolean().optional(),
      fullscreen_enforce: z.boolean().optional(),
      tab_blur_log: z.boolean().optional(),
      reveal_results: z.boolean().optional(),
      per_question_seconds: z.number().int().min(10).max(3600).nullable().optional(),
    })
    .optional(),
  pin: z.string().regex(/^\d{4,6}$/, "PIN is 4–6 digits").nullable().optional(),
});

const DeleteBody = z.object({ confirm: z.boolean() });

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const admin = supabaseAdmin();
  const row = await admin.from("exams").select("*").eq("id", params.id).maybeSingle();
  const exam = row.data as Exam | null;
  if (!exam) return bad("Exam not found.", 404);
  if (!(await examAccess(exam, auth.user.id, auth.memberships))) {
    return bad("You do not have access to this exam.", 403);
  }
  const questions = await admin
    .from("questions")
    .select("*")
    .eq("exam_id", exam.id)
    .order("ord");

  // Live-monitor payload: sessions + per-session answer counts.
  const sessionsRes = await admin
    .from("exam_sessions")
    .select("*")
    .eq("exam_id", exam.id)
    .order("attempt", { ascending: false })
    .limit(300);
  const sessions = (sessionsRes.data ?? []) as ExamSession[];
  let answers: { session_id: string; question_id: string; response: unknown; correct: boolean | null }[] = [];
  if (sessions.length > 0) {
    const aRes = await admin
      .from("answers")
      .select("session_id,question_id,response,correct")
      .in(
        "session_id",
        sessions.map((s) => s.id)
      );
    answers = (aRes.data ?? []) as typeof answers;
  }

  return ok({ exam, questions: questions.data ?? [], sessions, answers });
}

/** Update exam details, settings, PIN (crypt-hashed server-side). */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, PatchBody);
  if (!parsed.data) return parsed.res;

  const admin = supabaseAdmin();
  const row = await admin.from("exams").select("*").eq("id", params.id).maybeSingle();
  const exam = row.data as Exam | null;
  if (!exam) return bad("Exam not found.", 404);
  if (!(await examAccess(exam, auth.user.id, auth.memberships))) {
    return bad("You do not have access to this exam.", 403);
  }
  if (["live", "closed", "graded"].includes(exam.status)) {
    return bad("Settings and PIN are locked once the exam is running.", 400);
  }

  const { pin, settings, ...fields } = parsed.data;
  const upd: Record<string, unknown> = { ...fields };
  if (settings) upd.settings = { ...(exam.settings ?? {}), ...settings } as ExamSettings;
  if (pin !== undefined) {
    upd.pin_hash = pin === null ? "" : await hashPin(pin);
  }
  if (fields.class_id) {
    const cls = await admin
      .from("classes")
      .select("id")
      .eq("id", fields.class_id)
      .eq("school_id", exam.school_id)
      .maybeSingle();
    if (!cls.data) return bad("That class does not belong to your school.", 400);
  }

  const res = await admin
    .from("exams")
    .update(upd)
    .eq("id", exam.id)
    .select("id,invite_code,status,pin_hash,settings")
    .single();
  if (res.error) return bad("Could not update the exam.", 400);
  return ok({
    id: res.data.id,
    invite_code: res.data.invite_code,
    status: res.data.status,
    has_pin: !!res.data.pin_hash,
    settings: res.data.settings,
  });
}

/** Delete a draft/ready exam. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, DeleteBody);
  if (!parsed.data) return parsed.res;

  const admin = supabaseAdmin();
  const row = await admin.from("exams").select("*").eq("id", params.id).maybeSingle();
  const exam = row.data as Exam | null;
  if (!exam) return bad("Exam not found.", 404);
  if (!(await examAccess(exam, auth.user.id, auth.memberships))) {
    return bad("You do not have access to this exam.", 403);
  }
  if (!["draft", "ready"].includes(exam.status)) {
    return bad("Only drafts and ready exams can be deleted.", 400);
  }
  await admin.from("questions").delete().eq("exam_id", exam.id);
  const del = await admin.from("exams").delete().eq("id", exam.id);
  if (del.error) return bad("Could not delete the exam.", 400);
  return ok({ ok: true });
}
