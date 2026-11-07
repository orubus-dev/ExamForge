"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileStack,
  Plus,
  Users,
  UserPlus,
  GraduationCap,
  MailCheck,
  Building2,
  Fingerprint,
  LogIn,
  Inbox as InboxIcon,
  Monitor,
  Radio,
  BarChart3,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  linkClass,
  useToast,
} from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, cn } from "@/lib/utils";
import type { ExamStatus, PermFlag } from "@/lib/types";
import type { ShellViewer } from "@/components/AppShell";

export interface DashExam {
  id: string;
  title: string;
  subject: string;
  status: ExamStatus;
  invite_code: string;
  created_at: string;
}

export interface TeacherClass {
  id: string;
  name: string;
  short_code: string;
}

export interface DashAnalytics {
  exam_id: string;
  title: string;
  sessions: number;
  submitted: number;
  avg_pct: number | null;
}

export interface DashData extends ShellViewer {
  kind: string;
  hasMemberships: boolean;
  schoolId: string | null;
  exams: DashExam[];
  classes: TeacherClass[];
  counts: { members: number; classes: number; invites: number };
  /** Effective staff toggles (null for students) — mirror of the school console. */
  staffPerms: Record<PermFlag, boolean> | null;
  analytics: DashAnalytics[];
}

function JoinCodeForm() {
  const router = useRouter();
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const code = String(form.get("code") ?? "").trim().toUpperCase();
        if (!code) return;
        router.push(`/exam/join?code=${encodeURIComponent(code)}`);
      }}
    >
      <Input name="code" placeholder="EXM-AB12CD" className="font-mono" aria-label="Exam code" />
      <Button type="submit" variant="secondary">
        <LogIn size={16} aria-hidden /> Join
      </Button>
    </form>
  );
}

// ───────────────────────────────────────────────────────────────────── student

export function StudentView({ data }: { data: DashData }) {
  const toast = useToast();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Fingerprint size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">My Exam ID</h2>
        </div>
        <p className="mt-3 font-mono text-2xl tracking-wider">
          {data.studentTag ?? "Not issued yet"}
        </p>
        {data.studentTag && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={async () => {
              await navigator.clipboard.writeText(data.studentTag!);
              toast.push({ kind: "success", title: "Exam ID copied" });
            }}
          >
            Copy
          </Button>
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <LogIn size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Join exam with code</h2>
        </div>
        <div className="mt-3">
          <JoinCodeForm />
        </div>
        <p className="mt-2 text-xs text-muted">
          You&apos;ll wait in the lobby until the teacher starts the exam.
        </p>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <InboxIcon size={18} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Inbox</h2>
          </div>
          {data.unread > 0 && <Badge tone="danger">{data.unread} new</Badge>}
        </div>
        <p className="mt-3 text-xs text-muted">
          School invites and exam notices land here.
        </p>
        <Link href="/inbox" className={cn(linkClass("secondary", "sm"), "mt-3")}>
          Open inbox
        </Link>
      </Card>

      <Card className="p-6 lg:col-span-3">
        <div className="flex items-center gap-2">
          <FileStack size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Live now</h2>
        </div>
        <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
          {data.exams.length === 0 ? (
            <EmptyState
              title="No live exams"
              hint="When a teacher starts an exam for your class, join it with the code."
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.exams.map((ex) => (
                <li key={ex.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ex.title}</p>
                    <p className="text-xs text-muted">{ex.subject || "—"} · {ex.invite_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[ex.status]}>{STATUS_LABEL[ex.status]}</Badge>
                    <Link href={`/exam/join?code=${ex.invite_code}`} className={linkClass("secondary", "sm")}>
                      Join
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────── teacher

export function TeacherView({ data }: { data: DashData }) {
  const [createOpen, setCreateOpen] = useState(false);
  const canManageStudents = data.staffPerms?.manage_students ?? false;
  const canViewAnalytics = data.staffPerms?.view_analytics ?? false;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileStack size={18} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">My exams</h2>
          </div>
          <Link href="/exams/new" className={linkClass("primary", "sm")}>
            <Plus size={16} aria-hidden /> New exam
          </Link>
        </div>
        <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
          {data.exams.length === 0 ? (
            <EmptyState
              icon={<FileStack size={24} />}
              title="No exams yet"
              hint="Create your first exam — import a document, run OCR, or add questions manually."
              action={
                <Link href="/exams/new" className={linkClass("primary", "sm")}>
                  <Plus size={16} aria-hidden /> New exam
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-line">
              {data.exams.slice(0, 8).map((ex) => (
                <li key={ex.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{ex.title}</p>
                    <p className="font-mono text-xs text-muted">{ex.invite_code}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONE[ex.status]}>{STATUS_LABEL[ex.status]}</Badge>
                    <Link href={`/exams/${ex.id}/edit`} className={linkClass("secondary", "sm")}>
                      Edit
                    </Link>
                    {(ex.status === "ready" || ex.status === "live") && (
                      <Link href={`/exams/${ex.id}/monitor`} className={linkClass("secondary", "sm")}>
                        <Monitor size={14} aria-hidden />
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="space-y-4">
        {canManageStudents ? (
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-moss-600" aria-hidden />
              <h2 className="text-sm font-semibold">Create student account</h2>
            </div>
            <p className="mt-3 text-xs text-muted">
              Issue a school Exam ID (no email needed) — the student signs in with it and a password.
            </p>
            <Button
              size="sm"
              className="mt-3"
              onClick={() => setCreateOpen(true)}
              disabled={data.classes.length === 0}
            >
              <Plus size={15} aria-hidden /> New student
            </Button>
            {data.classes.length === 0 && (
              <p className="mt-2 text-[11px] text-muted">
                Ask your school admin to create a class first.
              </p>
            )}
          </Card>
        ) : (
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <UserPlus size={18} className="text-muted" aria-hidden />
              <h2 className="text-sm font-semibold">Student accounts</h2>
            </div>
            <p className="mt-3 text-xs text-muted">
              Your school admin has not enabled student management for your account. Once they flip
              it in the school console, you can issue Exam IDs here.
            </p>
          </Card>
        )}

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Classes</h2>
          </div>
          {data.classes.length === 0 ? (
            <p className="mt-3 text-xs text-muted">No classes yet — your school admin creates them.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.classes.map((c) => (
                <Link key={c.id} href={`/classes/${c.id}`}>
                  <Badge tone="neutral">{c.name}</Badge>
                </Link>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <InboxIcon size={18} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Inbox</h2>
          </div>
          <p className="mt-3 text-xs text-muted">
            {data.unread > 0 ? `${data.unread} unread item${data.unread === 1 ? "" : "s"}.` : "Nothing new."}
          </p>
          <Link href="/inbox" className={cn(linkClass("secondary", "sm"), "mt-3")}>
            Open inbox
          </Link>
        </Card>
      </div>

      {canViewAnalytics && data.analytics.length > 0 && (
        <Card className="p-6 lg:col-span-3">
          <div className="flex items-center gap-2">
            <BarChart3 size={18} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Results overview</h2>
          </div>
          <div className="scroll-slim mt-3 max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-medium">Exam</th>
                  <th className="py-2 font-medium">Started</th>
                  <th className="py-2 font-medium">Submitted</th>
                  <th className="py-2 font-medium">Avg score</th>
                </tr>
              </thead>
              <tbody>
                {data.analytics.map((a) => (
                  <tr key={a.exam_id} className="border-b border-line/60 last:border-0">
                    <td className="max-w-56 truncate py-2">{a.title}</td>
                    <td className="py-2">{a.sessions}</td>
                    <td className="py-2">{a.submitted}</td>
                    <td className="py-2 font-medium">
                      {a.avg_pct === null ? "—" : `${Math.round(a.avg_pct)}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <CreateStudentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        classes={data.classes}
        schoolId={data.schoolId ?? null}
      />
    </div>
  );
}

export interface CreateStudentModalProps {
  open: boolean;
  onClose: () => void;
  classes: TeacherClass[];
  schoolId: string | null;
}

/** Teacher-facing: issue a school student account (Exam ID + password). */
export function CreateStudentModal({ open, onClose, classes, schoolId }: CreateStudentModalProps) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ tag: string; temp_password: string } | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!schoolId) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    try {
      const res = await fetch("/api/org/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          school_id: schoolId,
          full_name: String(form.get("full_name") ?? ""),
          class_id: String(form.get("class_id") ?? "") || undefined,
          password: String(form.get("password") ?? ""),
        }),
      });
      const body = (await res.json()) as { tag?: string; temp_password?: string; error?: string };
      if (!res.ok || !body.tag) throw new Error(body.error ?? "Could not create the account");
      setIssued({ tag: body.tag, temp_password: body.temp_password ?? "" });
      router.refresh();
    } catch (err) {
      toast.push({ kind: "error", title: "Create failed", body: err instanceof Error ? err.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => { setIssued(null); onClose(); }} title="Create student account">
      {issued ? (
        <div className="space-y-3">
          <p className="text-sm">Account created. Hand these to the student:</p>
          <div className="rounded-lg border border-line bg-subtle p-3">
            <p className="text-xs text-muted">Exam ID</p>
            <p className="font-mono text-lg font-semibold tracking-wider">{issued.tag}</p>
            {issued.temp_password && (
              <>
                <p className="mt-2 text-xs text-muted">Temporary password</p>
                <p className="font-mono text-sm">{issued.temp_password}</p>
              </>
            )}
          </div>
          <p className="text-xs text-muted">
            The student signs in with <span className="font-mono">{issued.tag}</span> on the sign-in
            page under &ldquo;School account&rdquo;, then should change the password in Settings.
          </p>
          <Button
            className="w-full"
            onClick={() => {
              setIssued(null);
              onClose();
            }}
          >
            Done
          </Button>
        </div>
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <Label htmlFor="cs-name">Full name</Label>
            <Input id="cs-name" name="full_name" required minLength={2} maxLength={120} placeholder="Ada Lovelace" />
          </div>
          <div>
            <Label htmlFor="cs-class">Class</Label>
            <Select id="cs-class" name="class_id" required>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.short_code})
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="cs-password">Password</Label>
            <Input
              id="cs-password"
              name="password"
              type="text"
              required
              minLength={6}
              maxLength={40}
              placeholder="At least 6 characters"
              defaultValue={suggestPassword()}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={busy}>
              Create account
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function suggestPassword(): string {
  const words = ["forge", "bright", "quartz", "meadow", "spark", "orbit", "cedar", "lumen"];
  const w = words[Math.floor(Math.random() * words.length)];
  return `${w}-${Math.floor(1000 + Math.random() * 9000)}`;
}

// ─────────────────────────────────────────────────────────────────── org admin

export function OrgView({ data }: { data: DashData }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-6">
          <Users size={18} className="text-moss-600" aria-hidden />
          <p className="mt-2 text-2xl font-semibold">{data.counts.members}</p>
          <p className="text-xs text-muted">Members</p>
        </Card>
        <Card className="p-6">
          <GraduationCap size={18} className="text-moss-600" aria-hidden />
          <p className="mt-2 text-2xl font-semibold">{data.counts.classes}</p>
          <p className="text-xs text-muted">Classes</p>
        </Card>
        <Card className="p-6">
          <MailCheck size={18} className="text-moss-600" aria-hidden />
          <p className="mt-2 text-2xl font-semibold">{data.counts.invites}</p>
          <p className="text-xs text-muted">Pending invites</p>
        </Card>
      </div>
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">School console</h2>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href="/school" className={linkClass("primary", "sm")}>
            Manage school
          </Link>
          <Link href="/classes" className={linkClass("secondary", "sm")}>
            Classes
          </Link>
          <Link href="/exams" className={linkClass("secondary", "sm")}>
            Exams
          </Link>
          <Link href="/inbox" className={linkClass("secondary", "sm")}>
            <Radio size={15} aria-hidden /> Broadcasts & inbox
          </Link>
        </div>
      </Card>
    </div>
  );
}
