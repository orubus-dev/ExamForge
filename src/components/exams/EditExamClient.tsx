"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardPaste,
  Copy,
  FileText,
  Plus,
  ScanLine,
  Save,
  Settings2,
  Trash2,
  Upload,
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
  Tabs,
  Textarea,
  Toggle,
  useToast,
} from "@/components/ui";
import { copyText, inviteLink, STATUS_LABEL, STATUS_TONE } from "@/lib/utils";
import { parseQuestionsFromText } from "@/lib/parser";
import type { ExamSettings, Question, QuestionDraft, QuestionType, ClassRow } from "@/lib/types";

export interface EditExamData {
  exam: {
    id: string;
    title: string;
    subject: string;
    class_id: string | null;
    instructions: string;
    status: string;
    invite_code: string;
    pin_hash: string;
    settings: ExamSettings;
  };
  questions: Question[];
  classes: ClassRow[];
}

export default function EditExamClient({ data }: { data: EditExamData }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("questions");
  const [busy, setBusy] = useState<string | null>(null);

  const [title, setTitle] = useState(data.exam.title);
  const [subject, setSubject] = useState(data.exam.subject);
  const [classId, setClassId] = useState(data.exam.class_id ?? "");
  const [instructions, setInstructions] = useState(data.exam.instructions);
  const [settings, setSettings] = useState<ExamSettings>({ ...data.exam.settings });
  const [pin, setPin] = useState("");
  const [hasPin, setHasPin] = useState(!!data.exam.pin_hash);

  const [drafts, setDrafts] = useState<QuestionDraft[]>(() =>
    data.questions.map((q) => ({
      id: q.id,
      ord: q.ord,
      type: q.type,
      prompt: q.prompt,
      options: q.options ?? [],
      correct: q.correct ?? [],
      points: q.points,
      explanation: q.explanation ?? "",
    }))
  );
  const [editing, setEditing] = useState<QuestionDraft | null>(null);
  const [editingIndex, setEditingIndex] = useState(-1);

  const locked = ["live", "closed", "graded"].includes(data.exam.status);

  const totalPoints = useMemo(
    () => drafts.reduce((s, d) => s + d.points, 0),
    [drafts]
  );

  const set = <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const saveBasics = async () => {
    setBusy("basics");
    try {
      const res = await fetch(`/api/exams/${data.exam.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          subject,
          class_id: classId || null,
          instructions,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      toast.push({ kind: "success", title: "Exam details saved" });
      router.refresh();
    } catch (e) {
      toast.push({ kind: "error", title: "Save failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const saveSettings = async (extra?: { pin?: string | null }) => {
    setBusy("settings");
    try {
      const payload: Record<string, unknown> = { settings };
      if (extra && "pin" in extra) payload.pin = extra.pin ?? null;
      const res = await fetch(`/api/exams/${data.exam.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error?: string; has_pin?: boolean };
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      if (extra && "pin" in extra) {
        setHasPin(!!body.has_pin);
        setPin("");
      }
      toast.push({ kind: "success", title: "Settings saved" });
      router.refresh();
    } catch (e) {
      toast.push({ kind: "error", title: "Save failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const saveQuestions = async (next: QuestionDraft[]) => {
    setBusy("questions");
    try {
      const res = await fetch(`/api/exams/${data.exam.id}/questions`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questions: next.map((d, i) => ({
            ord: i,
            type: d.type,
            prompt: d.prompt,
            options: d.type === "truefalse" ? [] : d.options,
            correct: d.correct,
            points: d.points,
            explanation: d.explanation,
          })),
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not save questions");
      return true;
    } catch (e) {
      toast.push({ kind: "error", title: "Save failed", body: e instanceof Error ? e.message : undefined });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const persistDrafts = async (next: QuestionDraft[]) => {
    setDrafts(next);
    await saveQuestions(next);
  };

  const move = async (index: number, dir: -1 | 1) => {
    const next = [...drafts];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    await persistDrafts(next);
  };

  const remove = async (index: number) => {
    await persistDrafts(drafts.filter((_, i) => i !== index));
  };

  const openNew = () => {
    setEditingIndex(-1);
    setEditing({
      id: crypto.randomUUID(),
      ord: drafts.length,
      type: "mcq",
      prompt: "",
      options: [
        { key: "A", text: "" },
        { key: "B", text: "" },
        { key: "C", text: "" },
        { key: "D", text: "" },
      ],
      correct: [],
      points: 1,
      explanation: "",
    });
  };

  const openEdit = (index: number) => {
    setEditingIndex(index);
    setEditing({ ...drafts[index], options: drafts[index].options.map((o) => ({ ...o })) });
  };

  const saveQuestion = async (q: QuestionDraft) => {
    const next = [...drafts];
    if (editingIndex >= 0) next[editingIndex] = { ...q, ord: editingIndex };
    else next.push({ ...q, ord: next.length });
    setEditing(null);
    await persistDrafts(next.map((d, i) => ({ ...d, ord: i })));
  };

  const setReady = async () => {
    if (drafts.length === 0) {
      toast.push({ kind: "error", title: "Add at least one question first" });
      setTab("questions");
      return;
    }
    setBusy("ready");
    const saved = await saveQuestions(drafts);
    if (!saved) {
      setBusy(null);
      return;
    }
    try {
      const res = await fetch(`/api/exams/${data.exam.id}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "ready" }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not set ready");
      toast.push({ kind: "success", title: "Exam is ready" });
      router.refresh();
    } catch (e) {
      toast.push({ kind: "error", title: "Failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  const deleteExam = async () => {
    if (!confirm("Delete this exam and all its questions? This cannot be undone.")) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/exams/${data.exam.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Delete failed");
      router.replace("/exams");
    } catch (e) {
      toast.push({ kind: "error", title: "Delete failed", body: e instanceof Error ? e.message : undefined });
      setBusy(null);
    }
  };

  return (
    <div>
      <Link
        href="/exams"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden /> All exams
      </Link>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          <Badge tone={STATUS_TONE[data.exam.status as keyof typeof STATUS_TONE] ?? "neutral"}>
            {STATUS_LABEL[data.exam.status as keyof typeof STATUS_LABEL] ?? data.exam.status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <CopyCode code={data.exam.invite_code} />
          {!locked && (
            <Button size="sm" onClick={setReady} loading={busy === "ready"}>
              <Check size={15} aria-hidden /> Set ready
            </Button>
          )}
          {(data.exam.status === "ready" || data.exam.status === "live") && (
            <Link
              href={`/exams/${data.exam.id}/monitor`}
              className="inline-flex h-8 items-center rounded-lg border border-line px-2.5 text-xs transition-colors hover:bg-subtle"
            >
              Monitor
            </Link>
          )}
          {["draft", "ready"].includes(data.exam.status) && (
            <Button variant="danger" size="sm" onClick={deleteExam} loading={busy === "delete"}>
              <Trash2 size={15} aria-hidden />
            </Button>
          )}
        </div>
      </div>

      <Tabs
        items={[
          { id: "questions", label: `Questions (${drafts.length})` },
          { id: "settings", label: "Settings" },
          { id: "import", label: "Import" },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === "questions" && (
        <QuestionsTab
          drafts={drafts}
          totalPoints={totalPoints}
          locked={locked}
          busy={busy === "questions"}
          onNew={openNew}
          onEdit={openEdit}
          onMove={move}
          onRemove={remove}
        />
      )}

      {tab === "settings" && (
        <SettingsTab
          title={title}
          setTitle={setTitle}
          subject={subject}
          setSubject={setSubject}
          classId={classId}
          setClassId={setClassId}
          instructions={instructions}
          setInstructions={setInstructions}
          classes={data.classes}
          settings={settings}
          set={set}
          pin={pin}
          setPin={setPin}
          hasPin={hasPin}
          locked={locked}
          busy={busy}
          saveBasics={saveBasics}
          saveSettings={saveSettings}
        />
      )}

      {tab === "import" && (
        <ImportTab
          onParsed={async (parsed) => {
            const next = [...drafts, ...parsed.map((p, i) => ({ ...p, ord: drafts.length + i }))];
            await persistDrafts(next);
            toast.push({
              kind: "success",
              title: `${parsed.length} question${parsed.length === 1 ? "" : "s"} imported`,
              body: "Review them on the Questions tab — OCR misreads are common.",
            });
            setTab("questions");
          }}
        />
      )}

      {editing && (
        <QuestionModal
          draft={editing}
          onClose={() => setEditing(null)}
          onSave={saveQuestion}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────── bits

function CopyCode({ code }: { code: string }) {
  const toast = useToast();
  return (
    <button
      onClick={async () => {
        const okAll = await copyText(`${code} · ${inviteLink(code)}`);
        toast.push({
          kind: okAll ? "success" : "error",
          title: okAll ? "Code and join link copied" : "Copy failed",
        });
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-card px-2.5 font-mono text-xs transition-colors hover:bg-subtle"
      aria-label={`Copy invite code ${code}`}
    >
      <Copy size={13} aria-hidden />
      {code}
    </button>
  );
}

function QuestionsTab({
  drafts,
  totalPoints,
  locked,
  busy,
  onNew,
  onEdit,
  onMove,
  onRemove,
}: {
  drafts: QuestionDraft[];
  totalPoints: number;
  locked: boolean;
  busy: boolean;
  onNew: () => void;
  onEdit: (i: number) => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onRemove: (i: number) => void;
}) {
  const TYPE_LABEL: Record<QuestionType, string> = {
    mcq: "Single choice",
    multi: "Multiple answers",
    truefalse: "True / false",
    short: "Short answer",
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">
          {drafts.length} question{drafts.length === 1 ? "" : "s"} · {totalPoints} points total
        </p>
        {!locked && (
          <Button size="sm" onClick={onNew}>
            <Plus size={15} aria-hidden /> Add question
          </Button>
        )}
      </div>

      {drafts.length === 0 ? (
        <EmptyState
          icon={<FileText size={24} />}
          title="No questions yet"
          hint="Add questions manually or import from pasted text, a PDF, or a photo (OCR)."
          action={
            !locked ? (
              <Button size="sm" onClick={onNew}>
                <Plus size={15} aria-hidden /> Add question
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="divide-y divide-line">
          {drafts.map((d, i) => (
            <div key={d.id} className="flex items-start gap-3 p-4">
              <span className="mt-0.5 w-6 shrink-0 text-right text-xs text-muted">{i + 1}.</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{d.prompt || "(untitled)"}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{TYPE_LABEL[d.type]}</span>
                  {d.type !== "short" && d.type !== "truefalse" && (
                    <span>· {d.options.length} options</span>
                  )}
                  <span>· {d.points} pt</span>
                  {d.correct.length > 0 && (
                    <span className="font-mono">· key: {d.correct.join(", ")}</span>
                  )}
                </p>
              </div>
              {!locked && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => onMove(i, -1)}
                    disabled={i === 0}
                    aria-label="Move up"
                    className="rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => onMove(i, 1)}
                    disabled={i === drafts.length - 1}
                    aria-label="Move down"
                    className="rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-foreground disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <Button variant="secondary" size="sm" onClick={() => onEdit(i)}>
                    Edit
                  </Button>
                  <button
                    onClick={() => onRemove(i)}
                    aria-label="Delete question"
                    className="rounded-md p-1.5 text-muted transition-colors hover:bg-dogwood-50 hover:text-dogwood-600 dark:hover:bg-dogwood-900/30"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
      {busy && <p className="text-xs text-muted">Saving…</p>}
    </div>
  );
}

// ───────────────────────────────────────────────────────────── question modal

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"];

function QuestionModal({
  draft,
  onClose,
  onSave,
}: {
  draft: QuestionDraft;
  onClose: () => void;
  onSave: (q: QuestionDraft) => void;
}) {
  const [q, setQ] = useState<QuestionDraft>(draft);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<QuestionDraft>) => setQ((prev) => ({ ...prev, ...p }));

  const changeType = (type: QuestionType) => {
    if (type === "truefalse") {
      patch({ type, options: [], correct: [q.correct[0] === "false" ? "false" : "true"] });
    } else if (type === "short") {
      patch({ type, options: [], correct: [] });
    } else {
      const options = q.options.length > 0 ? q.options : [
        { key: "A", text: "" },
        { key: "B", text: "" },
        { key: "C", text: "" },
        { key: "D", text: "" },
      ];
      patch({ type, options });
    }
  };

  const setOption = (idx: number, text: string) => {
    const options = q.options.map((o, i) => (i === idx ? { ...o, text } : o));
    patch({ options });
  };

  const addOption = () => {
    if (q.options.length >= 8) return;
    const used = new Set(q.options.map((o) => o.key));
    const key = LETTERS.find((l) => !used.has(l)) ?? String(q.options.length + 1);
    patch({ options: [...q.options, { key, text: "" }] });
  };

  const removeOption = (idx: number) => {
    const key = q.options[idx]?.key;
    patch({
      options: q.options.filter((_, i) => i !== idx),
      correct: q.correct.filter((c) => c !== key),
    });
  };

  const toggleCorrect = (key: string) => {
    if (q.type === "mcq") {
      patch({ correct: [key] });
    } else if (q.type === "multi") {
      patch({
        correct: q.correct.includes(key)
          ? q.correct.filter((c) => c !== key)
          : [...q.correct, key],
      });
    }
  };

  const submit = () => {
    if (!q.prompt.trim()) {
      setError("The question needs a prompt.");
      return;
    }
    if (q.type === "mcq" || q.type === "multi") {
      const filled = q.options.filter((o) => o.text.trim());
      if (filled.length < 2) {
        setError("Give at least two options with text.");
        return;
      }
      if (q.correct.filter((c) => filled.some((o) => o.key === c)).length === 0) {
        setError("Mark the correct answer.");
        return;
      }
    }
    if (q.type === "short") {
      // correct stays empty — teacher grades manually
    }
    onSave({
      ...q,
      prompt: q.prompt.trim(),
      options: q.options.filter((o) => o.text.trim() || q.type === "short"),
      correct: q.type === "short" ? [] : q.correct,
    });
  };

  return (
    <Modal open onClose={onClose} title={draft.prompt ? "Edit question" : "New question"} width="max-w-2xl">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="q-type">Type</Label>
            <Select id="q-type" value={q.type} onChange={(e) => changeType(e.target.value as QuestionType)}>
              <option value="mcq">Single choice</option>
              <option value="multi">Multiple answers</option>
              <option value="truefalse">True / false</option>
              <option value="short">Short answer</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="q-points">Points</Label>
            <Input
              id="q-points"
              type="number"
              min={1}
              max={100}
              value={q.points}
              onChange={(e) => patch({ points: Math.max(1, Math.min(100, Number(e.target.value) || 1)) })}
            />
          </div>
        </div>

        <div>
          <Label htmlFor="q-prompt">Question</Label>
          <Textarea
            id="q-prompt"
            rows={2}
            value={q.prompt}
            onChange={(e) => patch({ prompt: e.target.value })}
            placeholder="What is 2 + 2?"
          />
        </div>

        {(q.type === "mcq" || q.type === "multi") && (
          <div className="space-y-2">
            <Label>Options — click the circle to mark the correct one{q.type === "multi" ? "s" : ""}</Label>
            {q.options.map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <button
                  type="button"
                  role={q.type === "multi" ? "checkbox" : "radio"}
                  aria-checked={q.correct.includes(o.key)}
                  aria-label={`Mark option ${o.key} correct`}
                  onClick={() => toggleCorrect(o.key)}
                  className={`h-5 w-5 shrink-0 rounded-full border transition-colors ${
                    q.correct.includes(o.key)
                      ? "border-moss-600 bg-accent"
                      : "border-line bg-card hover:bg-subtle"
                  }`}
                />
                <span className="w-5 shrink-0 font-mono text-xs text-muted">{o.key}</span>
                <Input value={o.text} onChange={(e) => setOption(i, e.target.value)} placeholder={`Option ${o.key}`} />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  aria-label={`Remove option ${o.key}`}
                  className="shrink-0 rounded-md p-1.5 text-muted transition-colors hover:bg-subtle hover:text-foreground"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <Button variant="ghost" size="sm" onClick={addOption}>
              <Plus size={14} aria-hidden /> Add option
            </Button>
          </div>
        )}

        {q.type === "truefalse" && (
          <div>
            <Label>Correct answer</Label>
            <Select
              value={q.correct[0] === "false" ? "false" : "true"}
              onChange={(e) => patch({ correct: [e.target.value] })}
            >
              <option value="true">True</option>
              <option value="false">False</option>
            </Select>
          </div>
        )}

        <div>
          <Label htmlFor="q-expl">Explanation (optional, shown to students if results are revealed)</Label>
          <Input
            id="q-expl"
            value={q.explanation}
            onChange={(e) => patch({ explanation: e.target.value })}
            placeholder="Basic arithmetic"
          />
        </div>

        {error && (
          <p role="alert" className="text-xs text-dogwood-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>
            <Save size={15} aria-hidden /> Save question
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────────── settings

function SettingsTab({
  title,
  setTitle,
  subject,
  setSubject,
  classId,
  setClassId,
  instructions,
  setInstructions,
  classes,
  settings,
  set,
  pin,
  setPin,
  hasPin,
  locked,
  busy,
  saveBasics,
  saveSettings,
}: {
  title: string;
  setTitle: (v: string) => void;
  subject: string;
  setSubject: (v: string) => void;
  classId: string;
  setClassId: (v: string) => void;
  instructions: string;
  setInstructions: (v: string) => void;
  classes: ClassRow[];
  settings: ExamSettings;
  set: <K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) => void;
  pin: string;
  setPin: (v: string) => void;
  hasPin: boolean;
  locked: boolean;
  busy: string | null;
  saveBasics: () => void;
  saveSettings: (extra?: { pin?: string | null }) => void;
}) {
  const windowLocal = settings.start_window_end
    ? new Date(settings.start_window_end).toISOString().slice(0, 16)
    : "";

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <FileText size={16} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Details</h2>
        </div>
        <div className="mt-3 space-y-3">
          <div>
            <Label htmlFor="e-title">Title</Label>
            <Input id="e-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="e-subject">Subject</Label>
              <Input id="e-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="e-class">Class</Label>
              <Select id="e-class" value={classId} onChange={(e) => setClassId(e.target.value)} disabled={locked}>
                <option value="">Whole school</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.short_code})
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="e-instructions">Instructions</Label>
            <Textarea
              id="e-instructions"
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
          <Button onClick={saveBasics} loading={busy === "basics"} disabled={locked}>
            Save details
          </Button>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Settings2 size={16} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Session settings</h2>
        </div>
        <div className="mt-3 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="s-duration">Duration (minutes)</Label>
              <Input
                id="s-duration"
                type="number"
                min={1}
                max={600}
                placeholder="no limit"
                value={settings.duration_minutes ?? ""}
                onChange={(e) =>
                  set(
                    "duration_minutes",
                    e.target.value ? Math.max(1, Math.min(600, Number(e.target.value) || 1)) : null
                  )
                }
                disabled={locked}
              />
            </div>
            <div>
              <Label htmlFor="s-window">Join window ends</Label>
              <Input
                id="s-window"
                type="datetime-local"
                value={windowLocal}
                onChange={(e) =>
                  set(
                    "start_window_end",
                    e.target.value ? new Date(e.target.value).toISOString() : null
                  )
                }
                disabled={locked}
              />
            </div>
          </div>
          <Toggle
            label="Shuffle questions"
            checked={!!settings.shuffle_questions}
            onChange={(v) => set("shuffle_questions", v)}
            disabled={locked}
          />
          <Toggle
            label="Shuffle options"
            checked={!!settings.shuffle_options}
            onChange={(v) => set("shuffle_options", v)}
            disabled={locked}
          />
          <Toggle
            label="One attempt per student"
            checked={settings.one_attempt !== false}
            onChange={(v) => set("one_attempt", v)}
            disabled={locked}
          />
          <Toggle
            label="Enforce fullscreen while taking"
            checked={!!settings.fullscreen_enforce}
            onChange={(v) => set("fullscreen_enforce", v)}
            disabled={locked}
          />
          <Toggle
            label="Log tab switches (blur events)"
            checked={settings.tab_blur_log !== false}
            onChange={(v) => set("tab_blur_log", v)}
            disabled={locked}
          />
          <Toggle
            label="Reveal results to students"
            checked={!!settings.reveal_results}
            onChange={(v) => set("reveal_results", v)}
            disabled={locked}
          />
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="s-pin">Exam PIN {hasPin ? "(set — enter a new one to replace)" : "(4–6 digits)"}</Label>
              <Input
                id="s-pin"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="••••"
                className="w-32 font-mono"
                disabled={locked}
              />
            </div>
            {hasPin && !locked && (
              <Button
                variant="ghost"
                onClick={() => saveSettings({ pin: null })}
                disabled={busy === "settings"}
              >
                Remove PIN
              </Button>
            )}
          </div>
          <Button
            onClick={() => (pin ? saveSettings({ pin }) : saveSettings())}
            loading={busy === "settings"}
            disabled={locked}
          >
            Save settings {pin ? "+ PIN" : ""}
          </Button>
          <p className="text-xs text-muted">
            The PIN is crypt-hashed (PBKDF2-SHA256) on the server before storage — it is never
            stored or logged in plain text.
          </p>
        </div>
      </Card>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────── import

function ImportTab({ onParsed }: { onParsed: (drafts: QuestionDraft[]) => Promise<void> }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"pdf" | "ocr" | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ocrRef = useRef<HTMLInputElement>(null);

  const runParser = (raw: string, source: string) => {
    const drafts = parseQuestionsFromText(raw);
    if (drafts.length === 0) {
      toast.push({
        kind: "error",
        title: "Nothing recognized",
        body: "Use numbered questions with lettered options, e.g. '1. Question' then 'A) ...'.",
      });
      return;
    }
    void onParsed(drafts);
  };

  const pdfExtract = async (file: File) => {
    setBusy("pdf");
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc =
        "https://unpkg.com/pdfjs-dist@4.7.76/build/pdf.worker.min.mjs";
      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      let out = "";
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        for (const item of content.items) {
          if ("str" in item) out += item.str + (item.hasEOL ? "\n" : " ");
        }
        out += "\n";
      }
      runParser(out, "PDF");
    } catch (e) {
      toast.push({
        kind: "error",
        title: "PDF extraction failed",
        body: e instanceof Error ? e.message : "The file may be scanned images — try OCR instead.",
      });
    } finally {
      setBusy(null);
    }
  };

  const ocrExtract = async (file: File) => {
    setBusy("ocr");
    try {
      const mod = await import("tesseract.js");
      const recognize = mod.recognize ?? mod.default.recognize;
      const { data } = await recognize(file, "eng");
      runParser(data.text, "OCR");
    } catch (e) {
      toast.push({
        kind: "error",
        title: "OCR failed",
        body: e instanceof Error ? e.message : "Could not read the image.",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <ClipboardPaste size={16} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Paste text</h2>
        </div>
        <p className="mt-1 text-xs text-muted">
          Numbered questions, lettered options, optional answer keys and points.
        </p>
        <Textarea
          rows={8}
          className="mt-3 font-mono text-xs"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"1. What is 2 + 2? (1 pt)\nA) 3\nB) 4\nC) 5\nAnswer: B\n\n2. The sky is green. (1 pt)\nAnswer: False"}
        />
        <Button
          className="mt-3"
          disabled={text.trim().length < 4}
          onClick={() => runParser(text, "paste")}
        >
          Parse pasted text
        </Button>
      </Card>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Document</h2>
          </div>
          <p className="mt-1 text-xs text-muted">.txt, .md or a text-based .pdf</p>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,.md,.markdown,.pdf,text/plain,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              if (file.name.toLowerCase().endsWith(".pdf")) {
                void pdfExtract(file);
              } else {
                void file.text().then((t) => runParser(t, "file"));
              }
            }}
          />
          <Button
            className="mt-3"
            variant="secondary"
            loading={busy === "pdf"}
            onClick={() => fileRef.current?.click()}
          >
            <FileText size={15} aria-hidden /> Choose file
          </Button>
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2">
            <ScanLine size={16} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Photo OCR</h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            Photograph a past paper — OCR (English) drafts the questions, then fix any misreads.
          </p>
          <input
            ref={ocrRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void ocrExtract(file);
            }}
          />
          <Button
            className="mt-3"
            variant="secondary"
            loading={busy === "ocr"}
            onClick={() => ocrRef.current?.click()}
          >
            <ScanLine size={15} aria-hidden /> Run OCR on an image
          </Button>
        </Card>
      </div>
    </div>
  );
}
