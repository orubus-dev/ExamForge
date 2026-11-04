"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FileStack,
  Plus,
  Users,
  GraduationCap,
  MailCheck,
  Building2,
  Fingerprint,
  LogIn,
  Inbox as InboxIcon,
  Monitor,
} from "lucide-react";
import { Badge, Button, Card, EmptyState, Input, linkClass, useToast } from "@/components/ui";
import { STATUS_LABEL, STATUS_TONE, cn } from "@/lib/utils";
import type { ExamStatus } from "@/lib/types";
import type { ShellViewer } from "@/components/AppShell";

export interface DashExam {
  id: string;
  title: string;
  subject: string;
  status: ExamStatus;
  invite_code: string;
  created_at: string;
}

export interface DashData extends ShellViewer {
  kind: string;
  hasMemberships: boolean;
  exams: DashExam[];
  classNames: string[];
  counts: { members: number; classes: number; invites: number };
}

export default function DashClient(data: DashData) {
  const router = useRouter();
  const toast = useToast();

  // First-run users without a school land on onboarding.
  useEffect(() => {
    if (data.hasMemberships) return;
    try {
      if (localStorage.getItem("ef-onboarded") !== "1") {
        router.replace("/onboarding");
      }
    } catch {
      router.replace("/onboarding");
    }
  }, [data.hasMemberships, router]);

  return (
    <div className="space-y-6">
      {data.role === "student" && <StudentView data={data} />}
      {data.role === "teacher" && <TeacherView data={data} />}
      {data.role === "org_admin" && <OrgView data={data} />}
      {data.role === "independent" && <IndependentView data={data} />}
    </div>
  );
}

function JoinCodeForm() {
  const router = useRouter();
  const toast = useToast();
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

function StudentView({ data }: { data: DashData }) {
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

function TeacherView({ data }: { data: DashData }) {
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
              hint="Create your first exam — paste a document or add questions manually."
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
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <GraduationCap size={18} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Classes</h2>
          </div>
          {data.classNames.length === 0 ? (
            <p className="mt-3 text-xs text-muted">No classes yet — your school admin creates them.</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.classNames.map((c) => (
                <Badge key={c} tone="neutral">{c}</Badge>
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
    </div>
  );
}

function OrgView({ data }: { data: DashData }) {
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
          <Link href="/exams/new" className={linkClass("secondary", "sm")}>
            <Plus size={16} aria-hidden /> New exam
          </Link>
          <Link href="/classes" className={linkClass("secondary", "sm")}>
            Classes
          </Link>
          <Link href="/channels" className={linkClass("secondary", "sm")}>
            Channels
          </Link>
        </div>
      </Card>
    </div>
  );
}

function IndependentView({ data }: { data: DashData }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="p-6">
        <h2 className="text-sm font-semibold">You&apos;re independent for now</h2>
        <p className="mt-2 text-xs text-muted">
          {data.kind === "teacher"
            ? "Schools can invite you from the School console — the invite lands in your inbox. Or create your own school to unlock exams."
            : "A school can invite you from the School console — the invite lands in your inbox with your class attached."}
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/school" className={linkClass("primary", "sm")}>
            <Building2 size={16} aria-hidden /> Create a school
          </Link>
          <Link href="/inbox" className={linkClass("secondary", "sm")}>
            Check inbox
          </Link>
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="text-sm font-semibold">Join exam with code</h2>
        <p className="mt-2 text-xs text-muted">
          Exam codes only work once your school membership is active.
        </p>
        <div className="mt-3">
          <JoinCodeForm />
        </div>
      </Card>
    </div>
  );
}
