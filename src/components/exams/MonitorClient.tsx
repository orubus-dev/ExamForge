"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  CircleDot,
  Monitor as MonitorIcon,
  Play,
  Square,
  Users,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, PageHeader, useToast } from "@/components/ui";
import { fmtClock, fmtDateTime, STATUS_LABEL, STATUS_TONE } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { ExamSettings, SessionStatus } from "@/lib/types";

export interface MonitorSession {
  id: string;
  student_id: string;
  student_name: string;
  status: SessionStatus;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
  score: number;
  total_points: number;
  tab_blurs: number;
  attempt: number;
}

export interface MonitorData {
  exam: {
    id: string;
    title: string;
    status: string;
    invite_code: string;
    settings: ExamSettings;
  };
  questionCount: number;
  totalPoints: number;
  sessions: MonitorSession[];
}

const SESSION_TONE: Record<SessionStatus, "neutral" | "info" | "success" | "warning" | "danger"> = {
  joined_waiting: "warning",
  in_progress: "info",
  submitted: "success",
  graded: "success",
  abandoned: "danger",
};

const SESSION_LABEL: Record<SessionStatus, string> = {
  joined_waiting: "Waiting",
  in_progress: "Taking",
  submitted: "Submitted",
  graded: "Graded",
  abandoned: "Abandoned",
};

export default function MonitorClient({ data }: { data: MonitorData }) {
  const router = useRouter();
  const toast = useToast();
  const [sessions, setSessions] = useState<MonitorSession[]>(data.sessions);
  const [status, setStatus] = useState(data.exam.status);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const channelRef = useRef<import("@supabase/supabase-js").RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/exams/${data.exam.id}`, { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        exam?: { status: string };
        sessions?: (Omit<MonitorSession, "student_name"> & { student_id: string })[];
      };
      if (body.exam?.status) setStatus(body.exam.status);
      if (body.sessions) {
        const names = new Map(data.sessions.map((s) => [s.student_id, s.student_name]));
        setSessions(body.sessions.map((s) => ({ ...s, student_name: names.get(s.student_id) ?? "Student" })));
      }
    } catch {
      /* transient */
    }
  }, [data.exam.id, data.sessions]);

  // Realtime: any exam_sessions row change for this exam refreshes the console.
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`monitor-${data.exam.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "exam_sessions", filter: `exam_id=eq.${data.exam.id}` },
        () => {
          void refresh();
        }
      )
      .subscribe();
    channelRef.current = channel;
    return () => {
      void supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [data.exam.id, refresh]);

  // Clock tick for elapsed / remaining columns.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const transition = async (next: "live" | "closed") => {
    setBusy(next);
    try {
      const res = await fetch(`/api/exams/${data.exam.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setStatus(next);
      toast.push({
        kind: "success",
        title: next === "live" ? "Exam started — students can begin" : "Exam closed",
      });
      router.refresh();
    } catch (e) {
      toast.push({ kind: "error", title: "Failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const waiting = sessions.filter((s) => s.status === "joined_waiting").length;
  const taking = sessions.filter((s) => s.status === "in_progress").length;
  const done = sessions.filter((s) => ["submitted", "graded"].includes(s.status)).length;
  const total = sessions.length;

  return (
    <div>
      <PageHeader
        title={data.exam.title}
        right={
          <>
            <Badge tone={STATUS_TONE[status as keyof typeof STATUS_TONE] ?? "neutral"}>
              {STATUS_LABEL[status as keyof typeof STATUS_LABEL] ?? status}
            </Badge>
            {status === "ready" && (
              <Button size="sm" onClick={() => transition("live")} loading={busy === "live"}>
                <Play size={15} aria-hidden /> Start exam
              </Button>
            )}
            {status === "live" && (
              <Button variant="danger" size="sm" onClick={() => transition("closed")} loading={busy === "closed"}>
                <Square size={15} aria-hidden /> Close
              </Button>
            )}
            {(status === "closed" || status === "graded") && (
              <Button size="sm" variant="secondary" onClick={() => router.push(`/results/${data.exam.id}`)}>
                Results
              </Button>
            )}
          </>
        }
      />

      {status === "draft" && (
        <Card className="mb-4 p-4">
          <p className="text-xs text-muted">
            Set the exam ready (from the editor) before you can start it here.
          </p>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <Users size={16} className="text-moss-600" aria-hidden />
          <p className="mt-2 text-2xl font-semibold">{total}</p>
          <p className="text-xs text-muted">Sessions</p>
        </Card>
        <Card className="p-4">
          <CircleDot size={16} className="text-moss-600" aria-hidden />
          <p className="mt-2 text-2xl font-semibold">{waiting}</p>
          <p className="text-xs text-muted">Waiting room</p>
        </Card>
        <Card className="p-4">
          <MonitorIcon size={16} className="text-moss-600" aria-hidden />
          <p className="mt-2 text-2xl font-semibold">{taking}</p>
          <p className="text-xs text-muted">Taking now</p>
        </Card>
        <Card className="p-4">
          <Activity size={16} className="text-moss-600" aria-hidden />
          <p className="mt-2 text-2xl font-semibold">
            {done}
            <span className="text-sm font-normal text-muted"> / {total}</span>
          </p>
          <p className="text-xs text-muted">Submitted</p>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <p className="text-xs text-muted">
            {data.questionCount} question{data.questionCount === 1 ? "" : "s"} · {data.totalPoints} points ·
            code <span className="font-mono">{data.exam.invite_code}</span>
          </p>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-moss-500" aria-hidden /> live
          </span>
        </div>
        <div className="scroll-slim max-h-96 overflow-y-auto">
          {sessions.length === 0 ? (
            <EmptyState
              title="No sessions yet"
              hint="Students appear here the moment they join with the code and PIN."
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2 font-medium">Student</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Blurs</th>
                  <th className="px-4 py-2 text-right font-medium">Score</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id} className="border-b border-line/60 last:border-0">
                    <td className="px-4 py-2.5">
                      <span className="font-medium">{s.student_name}</span>
                      {s.attempt > 1 && (
                        <span className="ml-1.5 text-xs text-muted">attempt {s.attempt}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={SESSION_TONE[s.status]}>{SESSION_LABEL[s.status]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">
                      {s.status === "in_progress" && s.deadline_at
                        ? `${fmtClock((new Date(s.deadline_at).getTime() - now) / 1000)} left`
                        : s.status === "joined_waiting"
                          ? "—"
                          : s.submitted_at
                            ? fmtDateTime(s.submitted_at)
                            : "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      {s.tab_blurs > 0 ? (
                        <Badge tone="danger">{s.tab_blurs}</Badge>
                      ) : (
                        <span className="text-xs text-muted">0</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {["submitted", "graded"].includes(s.status)
                        ? `${s.score} / ${s.total_points || data.totalPoints}`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}
