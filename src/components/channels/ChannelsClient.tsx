"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Hash, LockKeyhole, MessagesSquare, Plus, Users } from "lucide-react";
import {
  Button,
  Card,
  EmptyState,
  Input,
  Label,
  Modal,
  Select,
  useToast,
} from "@/components/ui";
import { createChannelKey, exportChannelKey } from "@/lib/crypto";
import { fmtDate } from "@/lib/utils";
import type { Channel } from "@/lib/types";

export interface ChannelsData {
  channels: (Channel & { members: number })[];
  myId: string;
}

export default function ChannelsClient({ data, viewerName = "" }: { data: ChannelsData; viewerName?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"group" | "class" | "dm">("group");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const key = await createChannelKey();
      const keyWrapped = await exportChannelKey(key);
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.trim(), kind, key_wrapped: keyWrapped }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Could not create the channel");
      toast.push({ kind: "success", title: "Channel created", body: "Messages are end-to-end encrypted." });
      router.push(`/channels/${body.id}`);
    } catch (e) {
      toast.push({ kind: "error", title: "Create failed", body: e instanceof Error ? e.message : undefined });
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Channels</h1>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus size={15} aria-hidden /> New channel
        </Button>
      </div>

      {data.channels.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare size={24} />}
          title="No channels yet"
          hint="Create an encrypted channel for a class, a study group, or staff chatter."
          action={
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus size={15} aria-hidden /> New channel
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.channels.map((c) => (
            <Link
              key={c.id}
              href={`/channels/${c.id}`}
              className="group rounded-lg border border-line bg-card p-4 transition-colors hover:border-jade-300 dark:hover:border-jade-700"
            >
              <div className="flex items-center justify-between">
                <Hash size={16} className="text-moss-600" aria-hidden />
                <LockKeyhole size={13} className="text-muted" aria-label="Encrypted" />
              </div>
              <p className="mt-2 truncate text-sm font-semibold">{c.title}</p>
              <p className="mt-1 text-xs text-muted">
                {c.kind} · {c.members} member{c.members === 1 ? "" : "s"} · {fmtDate(c.created_at)}
              </p>
            </Link>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New encrypted channel">
        <div className="space-y-3">
          <div>
            <Label htmlFor="ch-title">Title</Label>
            <Input
              id="ch-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="SS 2 Physics study group"
            />
          </div>
          <div>
            <Label htmlFor="ch-kind">Kind</Label>
            <Select id="ch-kind" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              <option value="group">Group</option>
              <option value="class">Class</option>
              <option value="dm">Direct</option>
            </Select>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <Users size={12} aria-hidden />
            You can share the channel by adding people later — the AES key stays in the channel row.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy} disabled={title.trim().length < 1}>
              Create channel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
