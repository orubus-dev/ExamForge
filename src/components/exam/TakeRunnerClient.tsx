"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, Flag, Maximize2, Send } from "lucide-react";
import { Badge, Button, Card, Input, useToast } from "@/components/ui";
import { cn, fmtClock } from "@/lib/utils";
import type { ExamSettings } from "@/lib/types";

export interface RunnerQuestion {
  id: string;
  ord: number;
  type: "mcq" | "multi" | "truefalse" | "short";
  prompt: string;
  options: { key: string; text: string }[];
  points: number;
}

export interface RunnerData {
  exam: {
    id: string;
    title: string;
    subject: string;
    instructions: string;
    invite_code: string;
    settings: ExamSettings;
  };
  session: {
    id: string;
    status: string;
    deadline_at: string | null;
    started_at: string | null;
    tab_blurs: number;
  };
  questions: RunnerQuestion[];
  savedAnswers: Record<string, string | string[]>;
}

type AnswerValue = string | string[] | null;

/** Deterministic shuffle seeded by the session id so resumes keep the same order. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    const j = Math.abs(h) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function TakeRunnerClient({ data }: { data: RunnerData }) {
  const router = useRouter();
  const toast = useToast();
  const settings = data.exam.settings ?? {};

  const [deadline, setDeadline] = useState<string | null>(data.session.deadline_at);
  const [started, setStarted] = useState(data.session.status === "in_progress");
  const [now, setNow] = useState(() => Date.now());
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(() => ({ ...data.savedAnswers }));
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fullscreenExit, setFullscreenExit] = useState(false);
  const dirtyRef = useRef<Set<string>>(new Set());
  const submittedRef = useRef(false);
  const beganRef = useRef(false);

  // Stable display order (shuffled once per session when enabled).
  const order = useMemo(() => {
    const qs = settings.shuffle_questions
      ? seededShuffle(data.questions, data.session.id)
      : data.questions;
    return qs.map((q) => q.id);
  }, [data.questions, data.session.id, settings.shuffle_questions]);

  const byId = useMemo(() => new Map(data.questions.map((q) => [q.id, q])), [data.questions]);

  const optionOrder = useMemo(() => {
    const map = new Map<string, { key: string; text: string }[]>();
    for (const q of data.questions) {
      map.set(
        q.id,
        settings.shuffle_options && q.type !== "truefalse"
          ? seededShuffle(q.options, `${data.session.id}:${q.id}`)
          : q.options
      );
    }
    return map;
  }, [data.questions, data.session.id, settings.shuffle_options]);

  // Flags persist locally per session.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`ef-flags-${data.session.id}`);
      if (raw) setFlags(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, [data.session.id]);

  // ── begin ────────────────────────────────────────────────────────────────
  const begin = useCallback(async () => {
    if (beganRef.current) return;
    beganRef.current = true;
    try {
      const res = await fetch("/api/exam/begin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session_id: data.session.id }),
      });
      const body = (await res.json()) as { deadline_at?: string | null; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not start");
      if (body.deadline_at) setDeadline(body.deadline_at);
      setStarted(true);

      if (settings.fullscreen_enforce) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          /* user/browser refused — the overlay will nag */
        }
      }
    } catch (e) {
      beganRef.current = false;
      toast.push({
        kind: "error",
        title: "Could not start",
        body: e instanceof Error ? e.message : undefined,
      });
      if (e instanceof Error && e.message === "not_live") {
        router.replace(`/exam/join?code=${data.exam.invite_code}`);
      }
    }
  }, [data.session.id, data.exam.invite_code, settings.fullscreen_enforce, router, toast]);

  useEffect(() => {
    if (!started) void begin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── clock ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ── autosave every 3s for dirty answers ──────────────────────────────────
  const flushSaves = useCallback(async () => {
    if (dirtyRef.current.size === 0 || submittedRef.current) return;
    const batch = Array.from(dirtyRef.current);
    dirtyRef.current.clear();
    for (const questionId of batch) {
      try {
        const res = await fetch("/api/exam/save-answer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            session_id: data.session.id,
            question_id: questionId,
            response: answers[questionId] ?? null,
          }),
        });
        if (res.ok) setSavedAt(new Date().toLocaleTimeString());
      } catch {
        dirtyRef.current.add(questionId); // retry next tick
      }
    }
  }, [answers, data.session.id]);

  useEffect(() => {
    const t = setInterval(() => void flushSaves(), 3000);
    return () => clearInterval(t);
  }, [flushSaves]);

  const setAnswer = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    dirtyRef.current.add(questionId);
  };

  const toggleFlag = (questionId: string) => {
    setFlags((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      try {
        localStorage.setItem(`ef-flags-${data.session.id}`, JSON.stringify(Array.from(next)));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // ── tab blur logging ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!settings.tab_blur_log) return;
    const onVis = () => {
      if (document.visibilityState === "hidden" && !submittedRef.current) {
        void fetch("/api/exam/blur", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: data.session.id }),
          keepalive: true,
        });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [data.session.id, settings.tab_blur_log]);

  // ── fullscreen enforcement ───────────────────────────────────────────────
  useEffect(() => {
    if (!settings.fullscreen_enforce || !started) return;
    const onFs = () => {
      setFullscreenExit(!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [settings.fullscreen_enforce, started]);

  // ── submit ───────────────────────────────────────────────────────────────
  const submit = useCallback(
    async (auto = false) => {
      if (submittedRef.current) return;
      submittedRef.current = true;
      setSubmitting(true);
      try {
        await flushSaves();
        const res = await fetch("/api/exam/submit", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ session_id: data.session.id }),
        });
        const body = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Submit failed");
        if (document.fullscreenElement) {
          try {
            await document.exitFullscreen();
          } catch {
            /* ignore */
          }
        }
        toast.push({
          kind: "success",
          title: auto ? "Time is up — submitted automatically" : "Exam submitted",
        });
        router.replace(`/results/${data.exam.id}`);
      } catch (e) {
        submittedRef.current = false;
        setSubmitting(false);
        toast.push({
          kind: "error",
          title: "Submit failed",
          body: e instanceof Error ? e.message : "Try again — your answers are saved.",
        });
      }
    },
    [data.exam.id, data.session.id, flushSaves, router, toast]
  );

  // Deadline auto-submit.
  useEffect(() => {
    if (!deadline || submittedRef.current || !started) return;
    if (new Date(deadline).getTime() - now <= 0) void submit(true);
  }, [deadline, now, started, submit]);

  // Warn on tab close mid-exam.
  useEffect(() => {
    const onBefore = (e: BeforeUnloadEvent) => {
      if (!submittedRef.current && started) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [started]);

  if (!started) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
      </div>
    );
  }

  const qid = order[current];
  const q = qid ? byId.get(qid) : undefined;
  const answeredCount = order.filter((id) => {
    const a = answers[id];
    return Array.isArray(a) ? a.length > 0 : a !== null && a !== undefined && a !== "";
  }).length;

  const remainingMs = deadline ? new Date(deadline).getTime() - now : null;
  const elapsedMs = data.session.started_at ? now - new Date(data.session.started_at).getTime() : 0;
  const lowTime = remainingMs !== null && remainingMs < 5 * 60 * 1000;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-4xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{data.exam.title}</p>
            <p className="text-[11px] text-muted">
              {savedAt ? `Saved ${savedAt}` : "Autosaves every few seconds"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {remainingMs !== null ? (
              <span
                className={cn(
                  "rounded-lg border px-3 py-1.5 font-mono text-sm font-semibold",
                  lowTime
                    ? "border-dogwood-300 bg-dogwood-50 text-dogwood-700 dark:border-dogwood-700 dark:bg-dogwood-900/30 dark:text-dogwood-200"
                    : "border-line bg-card"
                )}
                role="timer"
                aria-label="Time remaining"
              >
                {fmtClock(remainingMs / 1000)}
              </span>
            ) : (
              <span className="rounded-lg border border-line bg-card px-3 py-1.5 font-mono text-sm">
                {fmtClock(elapsedMs / 1000)}
              </span>
            )}
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={submitting}>
              <Send size={14} aria-hidden /> Submit
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
        {data.exam.instructions && current === 0 && (
          <Card className="mb-4 p-4">
            <p className="text-xs text-muted">Instructions</p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{data.exam.instructions}</p>
          </Card>
        )}

        {q ? (
          <Card className="p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-muted">
                  Question {current + 1} of {order.length} · {q.points} pt
                  {q.type === "multi" && " · pick all that apply"}
                  {q.type === "truefalse" && " · true or false"}
                  {q.type === "short" && " · type your answer"}
                </p>
                <h2 className="mt-2 whitespace-pre-wrap text-base font-medium">{q.prompt}</h2>
              </div>
              <button
                onClick={() => toggleFlag(q.id)}
                aria-pressed={flags.has(q.id)}
                aria-label={flags.has(q.id) ? "Remove flag" : "Flag for review"}
                className={cn(
                  "shrink-0 rounded-lg border p-2 transition-colors",
                  flags.has(q.id)
                    ? "border-flax-300 bg-flax-100 text-flax-900 dark:border-flax-700 dark:bg-flax-900/40 dark:text-flax-100"
                    : "border-line text-muted hover:bg-subtle"
                )}
              >
                <Flag size={15} />
              </button>
            </div>

            <div className="mt-5">
              {q.type === "truefalse" ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  {["true", "false"].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAnswer(q.id, v)}
                      role="radio"
                      aria-checked={answers[q.id] === v}
                      className={cn(
                        "rounded-lg border px-4 py-3 text-left text-sm capitalize transition-colors",
                        answers[q.id] === v
                          ? "border-jade-400 bg-accent/40 font-medium dark:bg-jade-900/30"
                          : "border-line bg-card hover:bg-subtle"
                      )}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              ) : q.type === "short" ? (
                <Input
                  value={(answers[q.id] as string) ?? ""}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                  placeholder="Type your answer…"
                  aria-label="Your answer"
                />
              ) : (
                <div className="space-y-2" role={q.type === "multi" ? "group" : "radiogroup"}>
                  {(optionOrder.get(q.id) ?? []).map((o) => {
                    const sel = Array.isArray(answers[q.id]) ? (answers[q.id] as string[]) : [];
                    const isSel = q.type === "multi" ? sel.includes(o.key) : answers[q.id] === o.key;
                    return (
                      <button
                        key={o.key}
                        onClick={() => {
                          if (q.type === "multi") {
                            setAnswer(
                              q.id,
                              isSel ? sel.filter((k) => k !== o.key) : [...sel, o.key]
                            );
                          } else {
                            setAnswer(q.id, o.key);
                          }
                        }}
                        role={q.type === "multi" ? "checkbox" : "radio"}
                        aria-checked={isSel}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-sm transition-colors",
                          isSel
                            ? "border-jade-400 bg-accent/40 dark:bg-jade-900/30"
                            : "border-line bg-card hover:bg-subtle"
                        )}
                      >
                        <span
                          className={cn(
                            "flex h-5 w-5 shrink-0 items-center justify-center border text-[10px] font-semibold",
                            q.type === "multi" ? "rounded-md" : "rounded-full",
                            isSel ? "border-moss-600 bg-accent text-[var(--accent-ink)]" : "border-line"
                          )}
                        >
                          {isSel ? "✓" : o.key}
                        </span>
                        <span>{o.text}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <Button
                variant="secondary"
                onClick={() => setCurrent((c) => Math.max(0, c - 1))}
                disabled={current === 0}
              >
                <ChevronLeft size={15} aria-hidden /> Previous
              </Button>
              {current < order.length - 1 ? (
                <Button onClick={() => setCurrent((c) => c + 1)}>
                  Next <ChevronRight size={15} aria-hidden />
                </Button>
              ) : (
                <Button onClick={() => setConfirmOpen(true)}>
                  <Send size={15} aria-hidden /> Review & submit
                </Button>
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <p className="text-sm">This exam has no questions yet.</p>
          </Card>
        )}

        {/* Question palette */}
        <Card className="mt-4 p-4">
          <div className="flex flex-wrap items-center gap-2">
            {order.map((id, i) => {
              const a = answers[id];
              const answered = Array.isArray(a) ? a.length > 0 : a !== null && a !== undefined && a !== "";
              return (
                <button
                  key={id}
                  onClick={() => setCurrent(i)}
                  aria-label={`Question ${i + 1}${answered ? ", answered" : ""}${
                    flags.has(id) ? ", flagged" : ""
                  }`}
                  className={cn(
                    "relative h-8 w-8 rounded-lg border text-xs font-medium transition-colors",
                    i === current
                      ? "border-transparent bg-accent text-[var(--accent-ink)]"
                      : answered
                        ? "border-moss-400 bg-pastel-100 text-moss-700 dark:border-moss-700 dark:bg-moss-900/30 dark:text-moss-200"
                        : "border-line bg-card hover:bg-subtle",
                    flags.has(id) && i !== current && "ring-1 ring-flax-400"
                  )}
                >
                  {i + 1}
                  {flags.has(id) && (
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-flax-500" />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted">
            {answeredCount} of {order.length} answered
          </p>
        </Card>
      </main>

      {fullscreenExit && settings.fullscreen_enforce && !submittedRef.current && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 p-4">
          <Card className="max-w-sm p-6 text-center">
            <Maximize2 size={22} className="mx-auto text-moss-600" aria-hidden />
            <p className="mt-3 text-sm font-semibold">Return to fullscreen</p>
            <p className="mt-1 text-xs text-muted">
              This exam runs in fullscreen. Your teacher sees blur events.
            </p>
            <Button
              className="mt-4 w-full"
              onClick={() => {
                void document.documentElement.requestFullscreen().finally(() => setFullscreenExit(false));
              }}
            >
              Go fullscreen
            </Button>
          </Card>
        </div>
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-sm p-6" role="dialog" aria-modal="true" aria-label="Submit exam">
            <div className="flex items-center gap-2">
              <AlertTriangle size={18} className="text-flax-600" aria-hidden />
              <h2 className="text-sm font-semibold">Submit your exam?</h2>
            </div>
            <p className="mt-2 text-xs text-muted">
              {order.length - answeredCount > 0
                ? `${order.length - answeredCount} question${order.length - answeredCount === 1 ? " is" : "s are"} unanswered.`
                : "Everything is answered."}{" "}
              You can&apos;t change answers after submitting.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={submitting}>
                Keep working
              </Button>
              <Button onClick={() => void submit(false)} loading={submitting}>
                Submit exam
              </Button>
            </div>
          </Card>
        </div>
      )}

      <footer className="border-t border-line px-4 py-3 text-center text-xs text-muted">
        <Badge tone="neutral">{data.exam.invite_code}</Badge> · answers autosave — a stable
        connection is enough
      </footer>
    </div>
  );
}
