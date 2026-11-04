"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, ClipboardList, Lock, Megaphone, Send } from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, Modal, useToast } from "@/components/ui";
import { cn, fmtDateTime, STATUS_LABEL, STATUS_TONE } from "@/lib/utils";
import type { QuestionType } from "@/lib/types";

export interface ResultsQuestion {
  id: string;
  ord: number;
  type: QuestionType;
  prompt: string;
  options: { key: string; text: string }[];
  correct: string[];
  points: number;
}

export interface ResultsAnswer {
  question_id: string;
  response: unknown;
  correct: boolean | null;
  points_awarded: number;
}

export interface ResultsSession {
  id: string;
  student_name: string;
  student_tag: string | null;
  status: string;
  score: number;
  total_points: number;
  tab_blurs: number;
  attempt: number;
  submitted_at: string | null;
  answers: ResultsAnswer[];
}

export interface ResultsData {
  mode: "teacher" | "student";
  exam: {
    id: string;
    title: string;
    status: string;
    invite_code: string;
    reveal_results: boolean;
  };
  questions: ResultsQuestion[];
  sessions: ResultsSession[];
  canSee?: boolean;
}

export default function ResultsClient({ data }: { data: ResultsData }) {
  const router = useRouter();
  const toast = useToast();
  const [sessions, setSessions] = useState(data.sessions);
  const [reveal, setReveal] = useState(data.exam.reveal_results);
  const [grading, setGrading] = useState<ResultsSession | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [published, setPublished] = useState(data.exam.status === "graded");

  const byQ = useMemo(
    () => new Map(data.questions.map((q) => [q.id, q])),
    [data.questions]
  );

  const doneSessions = sessions.filter((s) => ["submitted", "graded"].includes(s.status));
  const avg =
    doneSessions.length > 0
      ? Math.round(
          doneSessions.reduce((t, s) => t + (s.total_points ? (s.score / s.total_points) * 100 : 0), 0) /
            doneSessions.length
        )
      : 0;
  const pending = doneSessions.filter((s) =>
    s.answers.some((a) => a.correct === null || a.correct === undefined)
  ).length;

  const publish = async () => {
    setBusy("publish");
    try {
      const res = await fetch("/api/exam/publish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ exam_id: data.exam.id }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Publish failed");
      setPublished(true);
      setReveal(true);
      toast.push({ kind: "success", title: "Results published", body: "Students can see their breakdown." });
      router.refresh();
    } catch (e) {
      toast.push({ kind: "error", title: "Publish failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const saveGrades = async (
    session: ResultsSession,
    grades: { question_id: string; points_awarded: number; correct: boolean }[]
  ) => {
    setBusy("grade");
    try {
      const res = await fetch("/api/exam/grade", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: session.id, grades }),
      });
      const body = (await res.json()) as { error?: string; score?: number; status?: string };
      if (!res.ok) throw new Error(body.error ?? "Grading failed");
      setSessions((prev) =>
        prev.map((s) =>
          s.id === session.id
            ? {
                ...s,
                score: body.score ?? s.score,
                status: body.status ?? s.status,
                answers: s.answers.map((a) => {
                  const g = grades.find((x) => x.question_id === a.question_id);
                  return g ? { ...a, points_awarded: g.points_awarded, correct: g.correct } : a;
                }),
              }
            : s
        )
      );
      toast.push({ kind: "success", title: "Grades saved" });
      setGrading(null);
    } catch (e) {
      toast.push({ kind: "error", title: "Grading failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  // ── Student view ───────────────────────────────────────────────────────────
  if (data.mode === "student") {
    const s = sessions[0];
    if (!data.canSee || !s) {
      return (
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Results</h1>
          <EmptyState
            icon={<Lock size={24} />}
            title="Results aren't published yet"
            hint="When your teacher publishes them, your score and full breakdown appear here."
          />
        </div>
      );
    }
    return <StudentResult data={data} session={s} />;
  }

  // ── Teacher view ───────────────────────────────────────────────────────────
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Results</h1>
        <Button onClick={publish} loading={busy === "publish"} disabled={published || doneSessions.length === 0}>
          <Megaphone size={15} aria-hidden /> {published ? "Published" : "Publish results"}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard value={doneSessions.length} label="Submitted" />
        <StatCard value={`${avg}%`} label="Average score" />
        <StatCard value={pending} label={pending === 1 ? "Needs grading" : "Need grading"} />
        <StatCard value={reveal ? "Visible" : "Hidden"} label="Student view" />
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="scroll-slim max-h-96 overflow-y-auto">
          {sessions.length === 0 ? (
            <EmptyState icon={<ClipboardList size={24} />} title="No sessions yet" />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Student</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Submitted</th>
                  <th className="px-4 py-2.5 font-medium">Blurs</th>
                  <th className="px-4 py-2.5 text-right font-medium">Score</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const needsGrade =
                    ["submitted", "graded"].includes(s.status) &&
                    s.answers.some((a) => a.correct === null || a.correct === undefined);
                  return (
                    <tr key={s.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{s.student_name}</span>
                        {s.student_tag && (
                          <span className="ml-1.5 font-mono text-[11px] text-muted">{s.student_tag}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={STATUS_TONE[s.status as keyof typeof STATUS_TONE] ?? "neutral"}>
                          {STATUS_LABEL[s.status as keyof typeof STATUS_LABEL] ?? s.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted">{fmtDateTime(s.submitted_at)}</td>
                      <td className="px-4 py-2.5">{s.tab_blurs > 0 ? <Badge tone="danger">{s.tab_blurs}</Badge> : <span className="text-xs text-muted">0</span>}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-xs">
                        {["submitted", "graded"].includes(s.status) ? `${s.score}/${s.total_points}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {["submitted", "graded"].includes(s.status) ? (
                          <Button
                            size="sm"
                            variant={needsGrade ? "primary" : "secondary"}
                            onClick={() => setGrading(s)}
                          >
                            {needsGrade ? "Grade" : "Review"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted">waiting</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      {grading && (
        <GradingModal
          session={grading}
          questions={data.questions}
          busy={busy === "grade"}
          onClose={() => setGrading(null)}
          onSave={(grades) => saveGrades(grading, grades)}
        />
      )}
    </div>
  );
}

function StatCard({ value, label }: { value: string | number; label: string }) {
  return (
    <Card className="p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────── grading modal

function GradingModal({
  session,
  questions,
  busy,
  onClose,
  onSave,
}: {
  session: ResultsSession;
  questions: ResultsQuestion[];
  busy: boolean;
  onClose: () => void;
  onSave: (grades: { question_id: string; points_awarded: number; correct: boolean }[]) => void;
}) {
  const shortAnswers = session.answers
    .map((a) => ({ answer: a, q: questions.find((x) => x.id === a.question_id) }))
    .filter((x): x is { answer: ResultsAnswer; q: ResultsQuestion } => !!x.q && x.q.type === "short");

  const [scores, setScores] = useState<Record<string, number>>(() =>
    Object.fromEntries(shortAnswers.map(({ answer, q }) => [answer.question_id, answer.points_awarded || 0]))
  );

  const save = () => {
    const grades = shortAnswers.map(({ answer, q }) => ({
      question_id: answer.question_id,
      points_awarded: Math.min(q.points, Math.max(0, scores[answer.question_id] ?? 0)),
      correct: (scores[answer.question_id] ?? 0) >= q.points,
    }));
    onSave(grades);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Grade — ${session.student_name}`}
      width="max-w-2xl"
    >
      {shortAnswers.length === 0 ? (
        <p className="text-sm text-muted">
          Nothing to grade manually — every question was auto-graded.
        </p>
      ) : (
        <div className="space-y-4">
          {shortAnswers.map(({ answer, q }) => (
            <div key={answer.question_id} className="rounded-lg border border-line p-3">
              <p className="text-xs text-muted">
                Q{q.ord + 1} · {q.points} pt
              </p>
              <p className="mt-1 text-sm font-medium">{q.prompt}</p>
              <p className="mt-2 rounded-lg bg-subtle px-3 py-2 text-sm">
                {typeof answer.response === "string" && answer.response
                  ? answer.response
                  : "(no answer)"}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={q.points}
                  value={scores[answer.question_id] ?? 0}
                  onChange={(e) =>
                    setScores((prev) => ({
                      ...prev,
                      [answer.question_id]: Math.min(q.points, Math.max(0, Number(e.target.value) || 0)),
                    }))
                  }
                  className="w-20"
                  aria-label={`Score for question ${q.ord + 1}`}
                />
                <span className="text-xs text-muted">/ {q.points} points</span>
              </div>
            </div>
          ))}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              <Send size={15} aria-hidden /> Save grades
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ───────────────────────────────────────────────────────────── student view

function StudentResult({ data, session }: { data: ResultsData; session: ResultsSession }) {
  const pct = session.total_points > 0 ? Math.round((session.score / session.total_points) * 100) : 0;
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Results</h1>
        <Badge tone={STATUS_TONE[data.exam.status as keyof typeof STATUS_TONE] ?? "neutral"}>
          {STATUS_LABEL[data.exam.status as keyof typeof STATUS_LABEL] ?? data.exam.status}
        </Badge>
      </div>

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">{data.exam.title}</p>
            <p className="mt-1 text-xs text-muted">
              Submitted {fmtDateTime(session.submitted_at)} · attempt {session.attempt}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-semibold">{session.score}</p>
            <p className="text-xs text-muted">of {session.total_points} points · {pct}%</p>
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-subtle">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      </Card>

      <h2 className="mb-3 mt-6 text-sm font-semibold">Question breakdown</h2>
      <div className="space-y-3">
        {data.questions.map((q) => {
          const a = session.answers.find((x) => x.question_id === q.id);
          const correct = a?.correct;
          const awarded = a?.points_awarded ?? 0;
          const mine = Array.isArray(a?.response)
            ? (a?.response as string[])
            : typeof a?.response === "string" && a.response
              ? [a.response]
              : [];
          return (
            <Card key={q.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted">
                    Q{q.ord + 1} · {q.points} pt
                    {q.type === "short" && " · graded by your teacher"}
                  </p>
                  <p className="mt-1 text-sm font-medium">{q.prompt}</p>
                  {q.type !== "short" && (
                    <p className="mt-2 flex flex-wrap gap-2">
                      {mine.map((k) => {
                        const opt = q.options.find((o) => o.key === k);
                        return (
                          <span key={k} className="rounded-md bg-subtle px-2 py-0.5 text-xs">
                            {k}. {opt?.text ?? ""}
                          </span>
                        );
                      })}
                      {mine.length === 0 && <span className="text-xs text-muted">No answer</span>}
                    </p>
                  )}
                  {q.type === "short" && (
                    <p className="mt-2 rounded-lg bg-subtle px-3 py-2 text-sm">
                      {typeof a?.response === "string" && a.response ? a.response : "(no answer)"}
                    </p>
                  )}
                  {correct === true && (
                    <p className="mt-2 flex items-center gap-1 text-xs text-moss-600">
                      <BadgeCheck size={13} aria-hidden /> Correct
                    </p>
                  )}
                  {correct === false && (
                    <p className="mt-2 text-xs text-dogwood-600">
                      Correct answer: {q.correct.join(", ") || "—"}
                    </p>
                  )}
                  {correct === null && (
                    <p className="mt-2 text-xs text-muted">Pending teacher grading</p>
                  )}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-lg border px-2 py-1 font-mono text-xs",
                    correct === true
                      ? "border-moss-400 text-moss-700 dark:text-moss-300"
                      : correct === false
                        ? "border-dogwood-300 text-dogwood-700 dark:text-dogwood-300"
                        : "border-line text-muted"
                  )}
                >
                  {awarded}/{q.points}
                </span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
