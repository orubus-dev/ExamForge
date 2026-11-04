"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import type { ClassRow } from "@/lib/types";

export default function NewExamClient({
  classes,
  tierLabel,
  activeCount,
  activeLimit,
}: {
  classes: ClassRow[];
  tierLabel: string;
  activeCount: number;
  activeLimit: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [classId, setClassId] = useState("");
  const [instructions, setInstructions] = useState("");

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/exams", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title,
          subject,
          class_id: classId || undefined,
          instructions,
        }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Could not create the exam");
      router.replace(`/exams/${body.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the exam");
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="p-6 lg:col-span-2">
        <div className="space-y-3">
          <div>
            <Label htmlFor="exam-title">Title</Label>
            <Input
              id="exam-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mid-term Mathematics"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="exam-subject">Subject</Label>
              <Input
                id="exam-subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Mathematics"
              />
            </div>
            <div>
              <Label htmlFor="exam-class">Class (optional)</Label>
              <Select id="exam-class" value={classId} onChange={(e) => setClassId(e.target.value)}>
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
            <Label htmlFor="exam-instructions">Instructions</Label>
            <Textarea
              id="exam-instructions"
              rows={4}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="Answer all questions. The timer starts when you begin."
            />
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={create} loading={busy} disabled={title.trim().length < 2}>
              Create draft
            </Button>
            {error && <span className="text-xs text-dogwood-600">{error}</span>}
          </div>
        </div>
      </Card>
      <Card className="p-6">
        <h2 className="text-sm font-semibold">Your plan</h2>
        <p className="mt-3 text-2xl font-semibold">
          {activeCount}
          <span className="text-sm font-normal text-muted"> / {activeLimit} active</span>
        </p>
        <p className="mt-1 text-xs text-muted">
          {tierLabel} plan — active exams are drafts, ready or live.
        </p>
      </Card>
    </div>
  );
}
