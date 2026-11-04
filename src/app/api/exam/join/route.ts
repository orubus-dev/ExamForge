import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth, rateGuard } from "@/lib/api";
import type { Exam, ExamSession } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^EXM-[A-Z0-9]{6}$/, "Codes look like EXM-AB12CD"),
  pin: z.string().trim().regex(/^\d{4,6}$/, "PIN is 4–6 digits"),
});

const RPC_ERRORS: Record<string, string> = {
  exam_not_found: "No exam matches that code.",
  bad_pin: "That PIN is not correct.",
  not_a_student_of_this_school: "You are not a student of this school.",
};

function rpcMessage(raw: unknown): string {
  const text = String(raw ?? "");
  for (const key of Object.keys(RPC_ERRORS)) {
    if (text.includes(key)) return RPC_ERRORS[key];
  }
  return "Could not join the exam.";
}

/** Check exam status + my existing session for a code (waiting-room polling). */
export async function GET(req: Request) {
  const limited = rateGuard(req, "exam-join-get");
  if (limited) return limited;
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;

  const code = new URL(req.url).searchParams.get("code")?.trim().toUpperCase() ?? "";
  if (!/^EXM-[A-Z0-9]{6}$/.test(code)) return bad("Codes look like EXM-AB12CD.", 400);

  const admin = supabaseAdmin();
  const examRes = await admin
    .from("exams")
    .select("id,status,title,subject,settings")
    .eq("invite_code", code)
    .maybeSingle();
  const exam = examRes.data as Pick<Exam, "id" | "status" | "title" | "subject" | "settings"> | null;
  if (!exam) return bad("No exam matches that code.", 404);

  const sess = await admin
    .from("exam_sessions")
    .select("id,status,attempt")
    .eq("exam_id", exam.id)
    .eq("student_id", auth.user.id)
    .order("attempt", { ascending: false })
    .limit(1)
    .maybeSingle();
  const session = sess.data as Pick<ExamSession, "id" | "status" | "attempt"> | null;

  return ok({
    exam: { id: exam.id, status: exam.status, title: exam.title, subject: exam.subject },
    session: session
      ? { id: session.id, status: session.status, attempt: session.attempt }
      : null,
  });
}

/** Join by code + PIN → the join_exam_by_code RPC creates (or reuses) a session. */
export async function POST(req: Request) {
  const limited = rateGuard(req, "exam-join-post");
  if (limited) return limited;
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;

  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { code, pin } = parsed.data;

  const admin = supabaseAdmin();
  try {
    // Reuse an active session when one exists (resume without burning attempts).
    const examRes = await admin
      .from("exams")
      .select("id,status,title,subject,settings")
      .eq("invite_code", code)
      .maybeSingle();
    const exam = examRes.data as Pick<Exam, "id" | "status" | "title" | "subject" | "settings"> | null;

    if (exam) {
      const existing = await admin
        .from("exam_sessions")
        .select("id,status,attempt")
        .eq("exam_id", exam.id)
        .eq("student_id", auth.user.id)
        .order("attempt", { ascending: false })
        .limit(1)
        .maybeSingle();
      const session = existing.data as Pick<ExamSession, "id" | "status" | "attempt"> | null;
      if (session && ["joined_waiting", "in_progress"].includes(session.status)) {
        return ok({
          session_id: session.id,
          exam: { id: exam.id, status: exam.status, title: exam.title, subject: exam.subject },
          resumed: true,
        });
      }
    }

    const rpc = await admin.rpc("join_exam_by_code", { p_code: code, p_pin: pin });
    if (rpc.error) return bad(rpcMessage(rpc.error.message), 400);
    const sessionId = String(rpc.data);

    if (!exam) {
      const again = await admin
        .from("exams")
        .select("id,status,title,subject,settings")
        .eq("invite_code", code)
        .maybeSingle();
      if (!again.data) return bad("No exam matches that code.", 404);
      return ok({
        session_id: sessionId,
        exam: {
          id: again.data.id,
          status: again.data.status,
          title: again.data.title,
          subject: again.data.subject,
        },
        resumed: false,
      });
    }

    return ok({
      session_id: sessionId,
      exam: { id: exam.id, status: exam.status, title: exam.title, subject: exam.subject },
      resumed: false,
    });
  } catch (e) {
    console.error("[examforge:exam-join]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
