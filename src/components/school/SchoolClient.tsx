"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  GraduationCap,
  UserPlus,
  Users,
  MailCheck,
  Activity,
  KeyRound,
  Copy,
  Radio,
  School as SchoolIcon,
} from "lucide-react";
import {
  Badge,
  Button,
  Card,
  Input,
  Label,
  Modal,
  Select,
  Tabs,
  Toggle,
  EmptyState,
  useToast,
} from "@/components/ui";
import { copyText, fmtDate, suggestShortCode } from "@/lib/utils";
import type { SchoolInvite } from "@/lib/types";

export interface SchoolMemberRow {
  user_id: string;
  role: "org_admin" | "teacher" | "student";
  class_id: string | null;
  full_name: string;
  username: string | null;
  student_tag: string | null;
}

export interface SchoolClassRow {
  id: string;
  name: string;
  short_code: string;
  grade_level: string | null;
}

export interface SchoolEventRow {
  id: number;
  kind: string;
  exam_title: string | null;
  at: string;
}

export interface SchoolData {
  myUserId: string;
  school: {
    id: string;
    name: string;
    short_code: string;
    kind: string;
    plan: string;
  } | null;
  classes: SchoolClassRow[];
  members: SchoolMemberRow[];
  invites: SchoolInvite[];
  events: SchoolEventRow[];
}

const PERM_LABELS: { key: string; label: string }[] = [
  { key: "create_exams", label: "Create exams" },
  { key: "publish_results", label: "Publish results" },
  { key: "manage_question_bank", label: "Manage question bank" },
  { key: "manage_classes", label: "Manage classes" },
  { key: "message_students", label: "Message students" },
  { key: "view_analytics", label: "View analytics" },
  { key: "manage_students", label: "Manage students" },
  { key: "proctor_exams", label: "Proctor exams" },
];

const DEFAULT_PERMS: Record<string, boolean> = {
  create_exams: true,
  publish_results: false,
  manage_question_bank: false,
  manage_classes: false,
  message_students: true,
  view_analytics: false,
  manage_students: false,
  proctor_exams: false,
};

export default function SchoolClient(data: SchoolData) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("classes");
  const [busy, setBusy] = useState(false);

  // Create-school form
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"school" | "learning_center">("school");
  const [shortCode, setShortCode] = useState("");
  const [codeDirty, setCodeDirty] = useState(false);

  const effectiveCode = codeDirty ? shortCode : suggestShortCode(name);

  const createSchool = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/org/school", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, kind, short_code: effectiveCode }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not create the school");
      toast.push({ kind: "success", title: "School created" });
      router.refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Create failed",
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  if (!data.school) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Create a school</h2>
          </div>
          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="school-name">Name</Label>
              <Input
                id="school-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Hillcrest High School"
              />
            </div>
            <div>
              <Label htmlFor="school-kind">Kind</Label>
              <Select
                id="school-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as "school" | "learning_center")}
              >
                <option value="school">School</option>
                <option value="learning_center">Learning center</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="school-code">Short code (3 letters)</Label>
              <Input
                id="school-code"
                value={effectiveCode}
                onChange={(e) => {
                  setCodeDirty(true);
                  setShortCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3));
                }}
                placeholder="HIL"
                className="w-32 font-mono uppercase"
              />
            </div>
            <Button
              onClick={createSchool}
              loading={busy}
              disabled={name.trim().length < 2 || effectiveCode.length !== 3}
            >
              Create school
            </Button>
          </div>
        </Card>
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <SchoolIcon size={18} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">What you get</h2>
          </div>
          <ul className="mt-3 space-y-2 text-xs text-muted">
            <li>Classes with 3-letter short codes used in student Exam IDs.</li>
            <li>Teacher invites with fine-grained permissions (create exams is ON by default).</li>
            <li>School-issued student accounts with readable Exam IDs.</li>
            <li>Invites that land in the target&apos;s inbox — accept or decline.</li>
          </ul>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-card p-4">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-moss-600" aria-hidden />
          <span className="text-sm font-semibold">{data.school.name}</span>
          <Badge tone="neutral">{data.school.short_code}</Badge>
          <Badge tone="info">{data.school.plan}</Badge>
        </div>
        <span className="text-xs text-muted">
          {data.members.length} member{data.members.length === 1 ? "" : "s"} ·{" "}
          {data.classes.length} class{data.classes.length === 1 ? "" : "es"}
        </span>
      </div>

      <Tabs
        items={[
          { id: "classes", label: "Classes" },
          { id: "teachers", label: "Teachers" },
          { id: "students", label: "Students" },
          { id: "broadcast", label: "Broadcast" },
          { id: "invites", label: "Invites" },
          { id: "events", label: "Events" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "classes" && <ClassesTab data={data} busy={busy} setBusy={setBusy} />}
      {tab === "teachers" && <TeachersTab data={data} busy={busy} setBusy={setBusy} />}
      {tab === "students" && <StudentsTab data={data} busy={busy} setBusy={setBusy} />}
      {tab === "broadcast" && <BroadcastTab data={data} />}
      {tab === "invites" && <InvitesTab data={data} />}
      {tab === "events" && <EventsTab data={data} />}
    </div>
  );
}

type TabProps = { data: SchoolData; busy: boolean; setBusy: (b: boolean) => void };

function ClassesTab({ data, busy, setBusy }: TabProps) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/org/classes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: data.school!.id, name, short_code: code }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not create the class");
      toast.push({ kind: "success", title: "Class created" });
      setName("");
      setCode("");
      router.refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Create failed",
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Create class</h2>
        </div>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="class-name">Name</Label>
            <Input
              id="class-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="SS 2 Science"
            />
          </div>
          <div>
            <Label htmlFor="class-code">Short code (3 chars)</Label>
            <Input
              id="class-code"
              value={code}
              onChange={(e) =>
                setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3))
              }
              placeholder="SS2"
              className="w-32 font-mono uppercase"
            />
          </div>
          <Button onClick={create} loading={busy} disabled={!name.trim() || code.length !== 3}>
            Create class
          </Button>
        </div>
      </Card>
      <Card className="p-6 lg:col-span-2">
        <h2 className="text-sm font-semibold">All classes</h2>
        <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
          {data.classes.length === 0 ? (
            <EmptyState title="No classes yet" hint="Classes group students and scope exams." />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Code</th>
                  <th className="py-2 font-medium">Students</th>
                </tr>
              </thead>
              <tbody>
                {data.classes.map((c) => {
                  const n = data.members.filter(
                    (m) => m.role === "student" && m.class_id === c.id
                  ).length;
                  return (
                    <tr key={c.id} className="border-b border-line/60 last:border-0">
                      <td className="py-2">{c.name}</td>
                      <td className="py-2 font-mono">{c.short_code}</td>
                      <td className="py-2 text-muted">{n}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

function TeachersTab({ data, busy, setBusy }: TabProps) {
  const router = useRouter();
  const toast = useToast();
  const [who, setWho] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>({ ...DEFAULT_PERMS });
  const [target, setTarget] = useState<SchoolMemberRow | null>(null);

  const invite = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/org/teachers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          school_id: data.school!.id,
          username_or_email: who,
          permissions: perms,
        }),
      });
      const body = (await res.json()) as { error?: string; mode?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not send the invite");
      toast.push({
        kind: "success",
        title: body.mode === "joined" ? "Teacher added" : "Invite sent",
        body: body.mode === "joined" ? undefined : "It lands in their inbox.",
      });
      setWho("");
      router.refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Invite failed",
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const teachers = data.members.filter(
    (m) => m.role === "teacher" || m.role === "org_admin"
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Invite teacher</h2>
        </div>
        <div className="mt-3">
          <Label htmlFor="teacher-who">Username or email</Label>
          <Input
            id="teacher-who"
            value={who}
            onChange={(e) => setWho(e.target.value)}
            placeholder="existing username or name@school.edu"
          />
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {PERM_LABELS.map((p) => (
            <Toggle
              key={p.key}
              label={p.label}
              checked={perms[p.key]}
              onChange={(v) => setPerms((prev) => ({ ...prev, [p.key]: v }))}
            />
          ))}
        </div>
        <Button className="mt-3" onClick={invite} loading={busy} disabled={!who.trim()}>
          Send invite
        </Button>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold">Teachers & admins</h2>
        <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
          {teachers.length === 0 ? (
            <EmptyState title="No teachers yet" />
          ) : (
            <ul className="divide-y divide-line">
              {teachers.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {m.full_name || m.username}
                    </p>
                    <p className="text-xs text-muted">{m.username}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.role === "org_admin" && <Badge tone="info">Admin</Badge>}
                    <Button variant="secondary" size="sm" onClick={() => setTarget(m)}>
                      Permissions
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={`Permissions — ${target?.full_name || target?.username || ""}`}
      >
        {target && data.school && (
          <PermEditor
            schoolId={data.school.id}
            teacherId={target.user_id}
            onDone={() => {
              setTarget(null);
              router.refresh();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function PermEditor({
  schoolId,
  teacherId,
  onDone,
}: {
  schoolId: string;
  teacherId: string;
  onDone: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [perms, setPerms] = useState<Record<string, boolean>>({ ...DEFAULT_PERMS });

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/org/teachers", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ school_id: schoolId, teacher_id: teacherId, permissions: perms }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      toast.push({ kind: "success", title: "Permissions updated" });
      onDone();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Save failed",
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {PERM_LABELS.map((p) => (
          <Toggle
            key={p.key}
            label={p.label}
            checked={perms[p.key]}
            onChange={(v) => setPerms((prev) => ({ ...prev, [p.key]: v }))}
          />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button onClick={save} loading={busy}>
          Save permissions
        </Button>
      </div>
    </div>
  );
}

function StudentsTab({ data, busy, setBusy }: TabProps) {
  const router = useRouter();
  const toast = useToast();
  const [inviteWho, setInviteWho] = useState("");
  const [inviteClass, setInviteClass] = useState("");
  const [fullName, setFullName] = useState("");
  const [createClass, setCreateClass] = useState("");
  const [password, setPassword] = useState("");
  const [issuedTag, setIssuedTag] = useState<string | null>(null);

  const inviteStudent = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/org/invites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          school_id: data.school!.id,
          role: "student",
          target: inviteWho,
          class_id: inviteClass || undefined,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not send the invite");
      toast.push({ kind: "success", title: "Invite sent", body: "It lands in their inbox." });
      setInviteWho("");
      router.refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Invite failed",
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const createStudent = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/org/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          school_id: data.school!.id,
          full_name: fullName,
          class_id: createClass || undefined,
          password,
        }),
      });
      const body = (await res.json()) as { tag?: string; error?: string };
      if (!res.ok || !body.tag) throw new Error(body.error ?? "Could not create the student");
      setIssuedTag(body.tag);
      toast.push({ kind: "success", title: "Student created", body: `Exam ID: ${body.tag}` });
      setFullName("");
      setPassword("");
      router.refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Create failed",
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const students = data.members.filter((m) => m.role === "student");
  const classOptions = (
    label: string,
    value: string,
    onChange: (v: string) => void
  ) => (
    <div>
      <Label>{label}</Label>
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No class</option>
        {data.classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name} ({c.short_code})
          </option>
        ))}
      </Select>
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <MailCheck size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Invite existing student</h2>
        </div>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="student-who">Username or email</Label>
            <Input
              id="student-who"
              value={inviteWho}
              onChange={(e) => setInviteWho(e.target.value)}
            />
          </div>
          {classOptions("Class", inviteClass, setInviteClass)}
          <Button onClick={inviteStudent} loading={busy} disabled={!inviteWho.trim()}>
            Send invite
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Create school-issued account</h2>
        </div>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="student-name">Full name</Label>
            <Input
              id="student-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          {classOptions("Class", createClass, setCreateClass)}
          <div>
            <Label htmlFor="student-password">Password</Label>
            <Input
              id="student-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 6 characters"
            />
          </div>
          <Button
            onClick={createStudent}
            loading={busy}
            disabled={!fullName.trim() || password.length < 6}
          >
            Create account
          </Button>
          {issuedTag && (
            <div className="flex items-center gap-2 rounded-lg border border-jade-200 bg-jade-50 p-2.5 text-xs dark:border-jade-800 dark:bg-jade-900/30">
              <span className="text-muted">Exam ID</span>
              <span className="font-mono font-semibold">{issuedTag}</span>
              <button
                className="ml-auto inline-flex items-center gap-1 text-munsell-600 hover:underline"
                onClick={async () => {
                  await copyText(issuedTag);
                  toast.push({ kind: "success", title: "Copied" });
                }}
              >
                <Copy size={12} aria-hidden /> Copy
              </button>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-6 lg:col-span-2">
        <div className="flex items-center gap-2">
          <Users size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Students</h2>
        </div>
        <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
          {students.length === 0 ? (
            <EmptyState title="No students yet" />
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="py-2 font-medium">Name</th>
                  <th className="py-2 font-medium">Exam ID</th>
                  <th className="py-2 font-medium">Class</th>
                </tr>
              </thead>
              <tbody>
                {students.map((m) => {
                  const cls = data.classes.find((c) => c.id === m.class_id);
                  return (
                    <tr key={m.user_id} className="border-b border-line/60 last:border-0">
                      <td className="py-2">{m.full_name || m.username || "—"}</td>
                      <td className="py-2 font-mono">{m.student_tag ?? "—"}</td>
                      <td className="py-2 text-muted">
                        {cls ? `${cls.name} (${cls.short_code})` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

function InvitesTab({ data }: { data: SchoolData }) {
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold">Invites</h2>
      <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
        {data.invites.length === 0 ? (
          <EmptyState title="No invites yet" hint="Invites you send appear here with their status." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-muted">
                <th className="py-2 font-medium">Target</th>
                <th className="py-2 font-medium">Role</th>
                <th className="py-2 font-medium">Status</th>
                <th className="py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {data.invites.map((i) => (
                <tr key={i.id} className="border-b border-line/60 last:border-0">
                  <td className="py-2">{i.username || i.email || "—"}</td>
                  <td className="py-2 capitalize text-muted">{i.role}</td>
                  <td className="py-2">
                    <Badge
                      tone={
                        i.status === "pending"
                          ? "warning"
                          : i.status === "accepted"
                            ? "success"
                            : "neutral"
                      }
                    >
                      {i.status}
                    </Badge>
                  </td>
                  <td className="py-2 text-xs text-muted">{fmtDate(i.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Card>
  );
}

// ───────────────────────────────────────────────────────────────── broadcast

function BroadcastTab({ data }: { data: SchoolData }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState("all");
  const [classId, setClassId] = useState("");

  const send = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/org/broadcast", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          school_id: data.school!.id,
          title,
          body,
          class_id: audience === "class" ? classId : undefined,
        }),
      });
      const resBody = (await res.json()) as { delivered?: number; error?: string };
      if (!res.ok) throw new Error(resBody.error ?? "Could not send the broadcast");
      toast.push({
        kind: "success",
        title: "Broadcast sent",
        body: `Delivered to ${resBody.delivered ?? 0} inbox${resBody.delivered === 1 ? "" : "es"}.`,
      });
      setTitle("");
      setBody("");
      router.refresh();
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Broadcast failed",
        body: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Radio size={18} className="text-moss-600" aria-hidden />
        <h2 className="text-sm font-semibold">Broadcast to your school</h2>
      </div>
      <p className="mt-1 text-xs text-muted">
        Lands straight in members&apos; ExamForge inbox — exam notices, closures, reminders.
      </p>
      <div className="mt-3 max-w-xl space-y-3">
        <div>
          <Label htmlFor="bc-title">Title</Label>
          <Input
            id="bc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="Mid-term exams start Monday"
          />
        </div>
        <div>
          <Label htmlFor="bc-body">Message</Label>
          <textarea
            id="bc-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
            className="w-full rounded-lg border border-line bg-card px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-jade-300 dark:focus:ring-jade-700"
            placeholder="What should everyone know?"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="bc-audience">Audience</Label>
            <select
              id="bc-audience"
              value={audience}
              onChange={(e) => setAudience(e.target.value)}
              className="h-9 w-full rounded-lg border border-line bg-card px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-jade-300"
            >
              <option value="all">Everyone ({data.members.length} members)</option>
              <option value="students">Students only</option>
              <option value="teachers">Teachers only</option>
              <option value="class">One class</option>
            </select>
          </div>
          {audience === "class" && (
            <div>
              <Label htmlFor="bc-class">Class</Label>
              <select
                id="bc-class"
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-card px-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-jade-300"
              >
                <option value="">Pick a class…</option>
                {data.classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <Button
          onClick={send}
          loading={busy}
          disabled={title.trim().length < 2 || body.trim().length < 2 || (audience === "class" && !classId)}
        >
          <Radio size={15} aria-hidden /> Send broadcast
        </Button>
      </div>
    </Card>
  );
}

function EventsTab({ data }: { data: SchoolData }) {
  return (
    <Card className="p-6">
      <div className="flex items-center gap-2">
        <Activity size={18} className="text-moss-600" aria-hidden />
        <h2 className="text-sm font-semibold">Recent exam events</h2>
      </div>
      <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
        {data.events.length === 0 ? (
          <EmptyState
            title="No events yet"
            hint="Joins, starts, submits and blur events show up here."
          />
        ) : (
          <ul className="divide-y divide-line">
            {data.events.map((ev) => (
              <li key={ev.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="font-mono text-xs text-muted">{ev.kind}</span>
                <span className="min-w-0 flex-1 truncate px-2 text-xs">{ev.exam_title ?? "—"}</span>
                <span className="text-xs text-muted">{fmtDate(ev.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
