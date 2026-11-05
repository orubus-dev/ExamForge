"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, Check, Inbox as InboxIcon, Mail, Plus, Search, X } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Input,
  Modal,
  PageHeader,
  Tabs,
  useToast,
} from "@/components/ui";
import { cn, fmtDate } from "@/lib/utils";
import { createChannelKey, exportChannelKey } from "@/lib/crypto";

export interface InboxInviteUI {
  id: string;
  role: "student" | "teacher";
  school_name: string;
  class_id: string | null;
  created_at: string;
  expires_at: string;
}

export interface InboxMessageUI {
  id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

export interface InboxUIData {
  invites: InboxInviteUI[];
  messages: InboxMessageUI[];
}

export default function InboxClient({ data }: { data: InboxUIData }) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState("messages");
  const [busy, setBusy] = useState<string | null>(null);
  const [messages, setMessages] = useState(data.messages);
  const [invites, setInvites] = useState(data.invites);
  const [dmOpen, setDmOpen] = useState(false);

  const unread = messages.filter((m) => !m.read_at).length;

  const act = async (
    payload: { invite_id?: string; message_id?: string },
    action: "accept_invite" | "decline_invite" | "mark_read" | "mark_all_read",
    okMsg: string
  ) => {
    setBusy(action === "mark_read" ? payload.message_id ?? "x" : payload.invite_id ?? action);
    try {
      const res = await fetch("/api/inbox/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload }),
      });
      const body = (await res.json()) as { error?: string; class_id?: string | null };
      if (!res.ok) throw new Error(body.error ?? "Action failed");
      if (action === "accept_invite" && payload.invite_id) {
        setInvites((prev) => prev.filter((i) => i.id !== payload.invite_id));
      }
      if (action === "decline_invite" && payload.invite_id) {
        setInvites((prev) => prev.filter((i) => i.id !== payload.invite_id));
      }
      if (action === "mark_read" && payload.message_id) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === payload.message_id
              ? { ...m, read_at: new Date().toISOString() }
              : m
          )
        );
      }
      if (action === "mark_all_read") {
        setMessages((prev) => prev.map((m) => ({ ...m, read_at: m.read_at ?? new Date().toISOString() })));
      }
      toast.push({ kind: "success", title: okMsg });
      router.refresh();
    } catch (e) {
      toast.push({ kind: "error", title: "Action failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <PageHeader
        title="Inbox"
        right={
          <>
            {unread > 0 && (
              <Button variant="ghost" size="sm" onClick={() => act({}, "mark_all_read", "All marked read")}>
                Mark all read
              </Button>
            )}
            <Button size="sm" onClick={() => setDmOpen(true)}>
              <Plus size={15} aria-hidden /> New DM
            </Button>
          </>
        }
      />

      <StartDmModal open={dmOpen} onClose={() => setDmOpen(false)} />

      <Tabs
        items={[
          { id: "messages", label: `Messages${unread > 0 ? ` (${unread})` : ""}` },
          { id: "invites", label: `School invites${invites.length > 0 ? ` (${invites.length})` : ""}` },
        ]}
        value={tab}
        onChange={setTab}
        className="mb-4"
      />

      {tab === "invites" &&
        (invites.length === 0 ? (
          <EmptyState
            icon={<Building2 size={24} />}
            title="No school invites"
            hint="Invites your school sends land here — accept to join with your class attached."
          />
        ) : (
          <div className="space-y-3">
            {invites.map((i) => (
              <Card key={i.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {i.school_name} <Badge tone="info">{i.role}</Badge>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Sent {fmtDate(i.created_at)} · expires {fmtDate(i.expires_at)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    loading={busy === i.id}
                    onClick={() => act({ invite_id: i.id }, "accept_invite", "Invite accepted — welcome!")}
                  >
                    <Check size={14} aria-hidden /> Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => act({ invite_id: i.id }, "decline_invite", "Invite declined")}
                  >
                    <X size={14} aria-hidden /> Decline
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        ))}

      {tab === "messages" &&
        (messages.length === 0 ? (
          <EmptyState
            icon={<InboxIcon size={24} />}
            title="Nothing here yet"
            hint="Exam notices and system messages show up in this inbox."
          />
        ) : (
          <div className="space-y-3">
            {messages.map((m) => (
              <Card
                key={m.id}
                className={cn(
                  "flex flex-wrap items-start justify-between gap-3 p-4",
                  !m.read_at && "border-jade-300 dark:border-jade-700"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Mail size={14} className="text-muted" aria-hidden />
                    {m.title}
                    {!m.read_at && <Badge tone="warning">new</Badge>}
                  </p>
                  <p className="mt-1 text-sm text-muted">{m.body}</p>
                  <p className="mt-1 text-xs text-muted">{fmtDate(m.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {typeof m.payload?.exam_id === "string" && (
                    <Link
                      href={`/exam/join`}
                      className="rounded-lg border border-line px-2.5 py-1.5 text-xs transition-colors hover:bg-subtle"
                    >
                      Go to exam
                    </Link>
                  )}
                  {!m.read_at && (
                    <Button
                      size="sm"
                      variant="ghost"
                      loading={busy === m.id}
                      onClick={() => act({ message_id: m.id }, "mark_read", "Marked read")}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────── new-DM modal

interface DirectoryUser {
  id: string;
  username: string | null;
  full_name: string;
  kind: string;
}

function StartDmModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const search = async (value: string) => {
    setQ(value);
    if (value.trim().length < 2) {
      setUsers([]);
      setSearched(false);
      return;
    }
    setSearching(true);
    try {
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(value.trim())}`);
      const body = (await res.json()) as { users?: DirectoryUser[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Search failed");
      setUsers(body.users ?? []);
      setSearched(true);
    } catch (e) {
      toast.push({ kind: "error", title: "Search failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setSearching(false);
    }
  };

  const openDm = async (peerId: string) => {
    setOpening(peerId);
    try {
      const key = await createChannelKey();
      const keyWrapped = await exportChannelKey(key);
      const res = await fetch("/api/channels/dm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ peer_id: peerId, key_wrapped: keyWrapped }),
      });
      const body = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !body.id) throw new Error(body.error ?? "Could not open the DM");
      router.push(`/channels/${body.id}`);
    } catch (e) {
      toast.push({ kind: "error", title: "Could not open the DM", body: e instanceof Error ? e.message : undefined });
      setOpening(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Start a direct message">
      <div>
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <Input
            autoFocus
            value={q}
            onChange={(e) => void search(e.target.value)}
            placeholder="Search a username or name…"
            className="pl-8"
            aria-label="Search people"
          />
        </div>
        <div className="scroll-slim mt-3 max-h-72 overflow-y-auto">
          {!searched ? (
            <p className="px-1 py-6 text-center text-xs text-muted">
              Type at least 2 characters — usernames are how you address people.
            </p>
          ) : users.length === 0 && !searching ? (
            <p className="px-1 py-6 text-center text-xs text-muted">No one matches that yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {users.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{u.full_name || u.username}</p>
                    <p className="text-xs text-muted">@{u.username ?? "—"} · {u.kind}</p>
                  </div>
                  <Button size="sm" variant="secondary" loading={opening === u.id} onClick={() => void openDm(u.id)}>
                    Message
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
