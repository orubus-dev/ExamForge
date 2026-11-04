import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { examAccess } from "@/lib/examAccess";
import type { Exam } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Option = z.object({ key: z.string().trim().min(1).max(4), text: z.string().trim().min(1).max(500) });

const QuestionSchema = z.object({
  ord: z.number().int().min(0).max(500).optional(),
  type: z.enum(["mcq", "multi", "truefalse", "short"]),
  prompt: z.string().trim().min(1).max(2000),
  options: z.array(Option).max(8),
  correct: z.array(z.string().trim().max(500)).max(8),
  points: z.number().int().min(1).max(100),
  explanation: z.string().max(2000).optional().default(""),
});

const PutBody = z.object({ questions: z.array(QuestionSchema).max(300) });
const PostBody = z.object({ question: QuestionSchema });
const PatchBody = z.object({ question_id: z.string().uuid(), question: QuestionSchema });
const DeleteBody = z.object({ question_id: z.string().uuid() });

async function ownedExam(
  examId: string,
  auth: { user: { id: string }; memberships: Parameters<typeof examAccess>[2] }
): Promise<{ exam: Exam } | { res: ReturnType<typeof bad> }> {
  const row = await supabaseAdmin().from("exams").select("*").eq("id", examId).maybeSingle();
  const exam = row.data as Exam | null;
  if (!exam) return { res: bad("Exam not found.", 404) };
  if (!(await examAccess(exam, auth.user.id, auth.memberships))) {
    return { res: bad("You do not have access to this exam.", 403) };
  }
  if (["live", "closed", "graded"].includes(exam.status)) {
    return { res: bad("Questions are locked once the exam is running.", 400) };
  }
  return { exam };
}

interface QuestionInput {
  ord?: number;
  type: "mcq" | "multi" | "truefalse" | "short";
  prompt: string;
  options: { key: string; text: string }[];
  correct: string[];
  points: number;
  explanation?: string;
}

function normalize(q: QuestionInput, ord: number) {
  return {
    ord,
    type: q.type,
    prompt: q.prompt,
    options: q.options,
    correct: q.correct,
    points: q.points,
    explanation: q.explanation ?? "",
  };
}

/** Replace the full question list (bulk save from the editor). */
export async function PUT(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, PutBody);
  if (!parsed.data) return parsed.res;

  const owned = await ownedExam(params.id, auth);
  if ("res" in owned) return owned.res;

  const admin = supabaseAdmin();
  await admin.from("questions").delete().eq("exam_id", params.id);
  if (parsed.data.questions.length > 0) {
    const rows = parsed.data.questions.map((q, i) => ({
      exam_id: params.id,
      ...normalize(q, i),
    }));
    const ins = await admin.from("questions").insert(rows);
    if (ins.error) return bad("Could not save the questions.", 400);
  }
  return ok({ count: parsed.data.questions.length });
}

/** Add a single question at the end. */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, PostBody);
  if (!parsed.data) return parsed.res;

  const owned = await ownedExam(params.id, auth);
  if ("res" in owned) return owned.res;

  const admin = supabaseAdmin();
  const cnt = await admin.from("questions").select("id", { count: "exact" }).eq("exam_id", params.id);
  const ins = await admin
    .from("questions")
    .insert({ exam_id: params.id, ...normalize(parsed.data.question, cnt.count ?? 0) })
    .select("id")
    .single();
  if (ins.error) return bad("Could not add the question.", 400);
  return ok({ id: ins.data.id });
}

/** Update one question. */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, PatchBody);
  if (!parsed.data) return parsed.res;

  const owned = await ownedExam(params.id, auth);
  if ("res" in owned) return owned.res;

  const upd = await supabaseAdmin()
    .from("questions")
    .update(normalize(parsed.data.question, parsed.data.question.ord ?? 0))
    .eq("id", parsed.data.question_id)
    .eq("exam_id", params.id);
  if (upd.error) return bad("Could not update the question.", 400);
  return ok({ ok: true });
}

/** Delete one question and compact the ordering. */
export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, DeleteBody);
  if (!parsed.data) return parsed.res;

  const owned = await ownedExam(params.id, auth);
  if ("res" in owned) return owned.res;

  const admin = supabaseAdmin();
  await admin.from("questions").delete().eq("id", parsed.data.question_id).eq("exam_id", params.id);
  const rest = await admin
    .from("questions")
    .select("id,ord")
    .eq("exam_id", params.id)
    .order("ord");
  const rows = (rest.data ?? []) as { id: string; ord: number }[];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].ord !== i) {
      await admin.from("questions").update({ ord: i }).eq("id", rows[i].id);
    }
  }
  return ok({ ok: true });
}
