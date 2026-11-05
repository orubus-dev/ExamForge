"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ArrowRight, School as SchoolIcon, Check } from "lucide-react";
import { Button, Card, Input, Label, Select, useToast } from "@/components/ui";
import { suggestShortCode } from "@/lib/utils";

export default function CreateSchoolClient() {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

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
      toast.push({ kind: "success", title: "School created", body: "You're the admin." });
      setDone(true);
      router.replace("/school");
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

  if (done) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <Check size={28} className="mx-auto text-moss-600" aria-hidden />
        <h2 className="mt-3 text-sm font-semibold">School created</h2>
        <p className="mt-1 text-xs text-muted">Opening your console…</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <Building2 size={18} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">School details</h2>
        </div>
        <div className="mt-4 space-y-3">
          <div>
            <Label htmlFor="school-name">Name</Label>
            <Input
              id="school-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hillcrest High School"
              autoFocus
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
            <p className="mt-1 text-[11px] text-muted">
              Becomes the prefix of every student Exam ID (e.g. {effectiveCode || "SCH"}CLSADA).
            </p>
          </div>
          <Button
            onClick={createSchool}
            loading={busy}
            disabled={name.trim().length < 2 || effectiveCode.length !== 3}
          >
            Create school <ArrowRight size={16} aria-hidden />
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
          <li>School-issued student accounts with readable Exam IDs — no email needed.</li>
          <li>Invites and broadcasts that land in members&apos; inboxes.</li>
          <li>Live exam monitoring, grading and published results.</li>
        </ul>
      </Card>
    </div>
  );
}
