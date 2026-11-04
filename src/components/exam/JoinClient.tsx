"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DoorOpen, Hourglass, LogIn, RefreshCw } from "lucide-react";
import { Badge, Button, Card, Input, Label, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

interface JoinExamInfo {
  id: string;
  status: string;
  title: string;
  subject: string;
}

interface JoinSessionInfo {
  id: string;
  status: string;
  attempt: number;
}

type Phase = "form" | "waiting" | "entering";

export default function JoinClient({
  initialCode,
  schoolName,
  isStudent,
}: {
  initialCode: string;
  schoolName: string | null;
  isStudent: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [phase, setPhase] = useState<Phase>("form");
  const [code, setCode] = useState(initialCode);
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exam, setExam] = useState<JoinExamInfo | null>(null);
  const [session, setSession] = useState<JoinSessionInfo | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enterExam = useCallback(
    (examId: string, sessionId: string) => {
      router.push(`/exam/${examId}/take?session=${sessionId}`);
    },
    [router]
  );

  const doJoin = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/exam/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, pin }),
      });
      const body = (await res.json()) as {
        session_id?: string;
        exam?: JoinExamInfo;
        error?: string;
      };
      if (!res.ok || !body.session_id || !body.exam) {
        throw new Error(body.error ?? "Could not join");
      }
      setExam(body.exam);
      setSession({ id: body.session_id, status: "joined_waiting", attempt: 1 });
      if (body.exam.status === "live") {
        setPhase("entering");
        enterExam(body.exam.id, body.session_id);
      } else {
        setPhase("waiting");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not join");
    } finally {
      setBusy(false);
    }
  };

  // Waiting room: watch the exam row (realtime + polling) and auto-enter on live.
  useEffect(() => {
    if (phase !== "waiting" || !exam || !session) return;
    const supabase = supabaseBrowser();

    const check = async () => {
      try {
        const res = await fetch(`/api/exam/join?code=${encodeURIComponent(code)}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const body = (await res.json()) as {
          exam?: JoinExamInfo;
          session?: JoinSessionInfo | null;
        };
        if (body.exam) setExam(body.exam);
        if (body.exam?.status === "live") {
          setPhase("entering");
          if (body.session) enterExam(body.exam.id, body.session.id);
        } else if (body.session) {
          setSession(body.session);
        }
      } catch {
        /* keep polling */
      }
    };

    const poll = setInterval(check, 5000);
    pollRef.current = poll;
    const channel = supabase
      .channel(`join-${exam.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exams", filter: `id=eq.${exam.id}` },
        () => {
          void check();
        }
      )
      .subscribe();

    return () => {
      clearInterval(poll);
      void supabase.removeChannel(channel);
      pollRef.current = null;
    };
  }, [phase, exam, session, code, enterExam]);

  if (phase === "waiting" && exam && session) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col items-center justify-center px-4">
        <Card className="w-full p-8 text-center">
          <Hourglass size={28} className="mx-auto text-moss-600" aria-hidden />
          <h1 className="mt-4 text-lg font-semibold tracking-tight">{exam.title}</h1>
          <p className="mt-2 text-sm text-muted">
            Exam hasn&apos;t started yet — waiting for your teacher
          </p>
          <div className="mt-5 flex items-center justify-center gap-2">
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-moss-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-moss-500" />
            </span>
            <span className="text-xs text-muted">You&apos;ll enter automatically when it starts</span>
          </div>
          <p className="mt-4 font-mono text-xs text-muted">
            {exam.subject ? `${exam.subject} · ` : ""}attempt {session.attempt}
          </p>
        </Card>
        <button
          onClick={() => {
            setPhase("form");
            setSession(null);
            setExam(null);
          }}
          className="mt-4 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
        >
          <RefreshCw size={12} aria-hidden /> Leave the waiting room
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Join an exam</h1>
      </div>

      {!isStudent && (
        <Card className="mb-4 p-3">
          <p className="text-xs text-muted">
            Exam codes only work for students of the school running the exam
            {schoolName ? ` (${schoolName})` : ""}.
          </p>
        </Card>
      )}

      <Card className="p-6">
        <div className="space-y-3">
          <div>
            <Label htmlFor="join-code">Exam code</Label>
            <Input
              id="join-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().trim())}
              placeholder="EXM-AB12CD"
              className="font-mono text-base tracking-wider"
              autoComplete="off"
              autoFocus={!initialCode}
            />
          </div>
          <div>
            <Label htmlFor="join-pin">PIN</Label>
            <Input
              id="join-pin"
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="••••"
              className="font-mono text-base tracking-widest"
              autoComplete="off"
            />
          </div>
          <Button
            className="w-full"
            loading={busy}
            onClick={doJoin}
            disabled={!/^EXM-[A-Z0-9]{6}$/.test(code) || pin.length < 4}
          >
            <LogIn size={16} aria-hidden /> Join exam
          </Button>
          {error && (
            <p role="alert" className="rounded-lg border border-dogwood-200 bg-dogwood-50 px-3 py-2 text-xs text-dogwood-900 dark:border-dogwood-800 dark:bg-dogwood-900/30 dark:text-dogwood-100">
              {error}
            </p>
          )}
        </div>
      </Card>

      <p className="mt-4 text-center text-xs text-muted">
        No code? Ask your teacher. <Badge tone="neutral">Codes look like EXM-AB12CD</Badge>
      </p>
      <p className="mt-6 text-center text-xs">
        <Link href="/dash" className="inline-flex items-center gap-1 text-munsell-600 hover:underline">
          <DoorOpen size={12} aria-hidden /> Back to dashboard
        </Link>
      </p>
    </div>
  );
}
