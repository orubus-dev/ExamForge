"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  File as FileIcon,
  Image as ImageIcon,
  Lock,
  Mic,
  Send,
  Video,
} from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase/client";
import {
  importChannelKey,
  openBytes,
  openText,
  sealBytes,
  sealText,
} from "@/lib/crypto";
import type { Message } from "@/lib/types";

export interface RoomMessage {
  id: string;
  channel_id: string;
  sender_id: string;
  sender_name: string;
  kind: Message["kind"];
  ciphertext: string;
  media_path: string | null;
  media_meta: { iv?: string; name?: string; type?: string; size?: number } & Record<string, unknown>;
  created_at: string;
}

export interface RoomData {
  channel: { id: string; title: string; kind: string; key_wrapped: string };
  myId: string;
  isMember: boolean;
  members: { user_id: string; role: string; name: string }[];
  messages: RoomMessage[];
}

const MEDIA_BUCKET = "examforge-media";

export default function ChannelRoomClient({ data }: { data: RoomData }) {
  const toast = useToast();
  const [messages, setMessages] = useState<RoomMessage[]>(data.messages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const urlsRef = useRef<Map<string, string>>(new Map());

  const keyPromise = useMemo(() => importChannelKey(data.channel.key_wrapped), [data.channel.key_wrapped]);

  const decrypt = useCallback(
    async (m: RoomMessage): Promise<string> => {
      try {
        return await openText(await keyPromise, m.ciphertext);
      } catch {
        return "(unable to decrypt)";
      }
    },
    [keyPromise]
  );

  const [plain, setPlain] = useState<Map<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    (async () => {
      const next = new Map<string, string>();
      for (const m of messages) {
        next.set(m.id, await decrypt(m));
      }
      if (alive) setPlain(next);
    })();
    return () => {
      alive = false;
    };
  }, [messages, decrypt]);

  // Realtime messages.
  useEffect(() => {
    const supabase = supabaseBrowser();
    const channel = supabase
      .channel(`room-${data.channel.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${data.channel.id}` },
        (payload) => {
          const row = payload.new as Message;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            return [
              ...prev,
              {
                id: row.id,
                channel_id: row.channel_id,
                sender_id: row.sender_id,
                sender_name: data.members.find((x) => x.user_id === row.sender_id)?.name ?? "member",
                kind: row.kind,
                ciphertext: row.ciphertext,
                media_path: row.media_path,
                media_meta: row.media_meta ?? {},
                created_at: row.created_at,
              },
            ];
          });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [data.channel.id, data.members]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [plain.size]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const ciphertext = await sealText(await keyPromise, text);
      const supabase = supabaseBrowser();
      const ins = await supabase.from("messages").insert({
        channel_id: data.channel.id,
        sender_id: data.myId,
        kind: "text",
        ciphertext,
        media_path: null,
        media_meta: {},
      });
      if (ins.error) throw new Error(ins.error.message);
      setDraft("");
      const res = await supabase
        .from("messages")
        .select("*")
        .eq("channel_id", data.channel.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const row = (res.data as Message[] | null)?.[0];
      if (row && !messages.some((m) => m.id === row.id)) {
        setMessages((prev) => [
          ...prev,
          {
            id: row.id,
            channel_id: row.channel_id,
            sender_id: row.sender_id,
            sender_name: data.members.find((x) => x.user_id === row.sender_id)?.name ?? "You",
            kind: row.kind,
            ciphertext: row.ciphertext,
            media_path: row.media_path,
            media_meta: row.media_meta ?? {},
            created_at: row.created_at,
          },
        ]);
      }
    } catch (e) {
      toast.push({ kind: "error", title: "Send failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setSending(false);
    }
  };

  const upload = async (file: File, kind: "file" | "image") => {
    if (uploading) return;
    setUploading(true);
    try {
      const sealed = await sealBytes(await keyPromise, await file.arrayBuffer());
      const path = `${data.myId}/${data.channel.id}/${Date.now()}-${file.name}`;
      const supabase = supabaseBrowser();
      const up = await supabase.storage
        .from(MEDIA_BUCKET)
        .upload(path, sealed.data, { contentType: "application/octet-stream" });
      if (up.error) throw new Error(up.error.message);
      const ciphertext = await sealText(await keyPromise, kind === "image" ? "🖼 image" : "📎 file");
      const ins = await supabase.from("messages").insert({
        channel_id: data.channel.id,
        sender_id: data.myId,
        kind,
        ciphertext,
        media_path: path,
        media_meta: { iv: sealed.iv, name: file.name, type: file.type, size: sealed.size },
      });
      if (ins.error) throw new Error(ins.error.message);
    } catch (e) {
      toast.push({ kind: "error", title: "Upload failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setUploading(false);
    }
  };

  const download = async (m: RoomMessage) => {
    try {
      const supabase = supabaseBrowser();
      const signed = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(m.media_path ?? "", 600);
      if (signed.error || !signed.data?.signedUrl) throw new Error("Could not sign the media URL");
      const res = await fetch(signed.data.signedUrl, { cache: "no-store" });
      const sealed = await res.arrayBuffer();
      const open = await openBytes(await keyPromise, sealed, String(m.media_meta?.iv ?? ""));
      const url = URL.createObjectURL(new Blob([open], { type: String(m.media_meta?.type ?? "application/octet-stream") }));
      const a = document.createElement("a");
      a.href = url;
      a.download = String(m.media_meta?.name ?? "file");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      toast.push({ kind: "error", title: "Download failed", body: e instanceof Error ? e.message : undefined });
    }
  };

  const previewImage = async (m: RoomMessage): Promise<string> => {
    const cached = urlsRef.current.get(m.id);
    if (cached) return cached;
    const supabase = supabaseBrowser();
    const signed = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(m.media_path ?? "", 600);
    if (signed.error || !signed.data?.signedUrl) throw new Error("no url");
    const res = await fetch(signed.data.signedUrl, { cache: "no-store" });
    const sealed = await res.arrayBuffer();
    const open = await openBytes(await keyPromise, sealed, String(m.media_meta?.iv ?? ""));
    const url = URL.createObjectURL(new Blob([open], { type: String(m.media_meta?.type ?? "image/png") }));
    urlsRef.current.set(m.id, url);
    return url;
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-8rem)] w-full max-w-4xl flex-col px-4 sm:px-6">
      <div className="flex items-center justify-between border-b border-line py-3">
        <div className="min-w-0">
          <Link
            href="/channels"
            className="mb-0.5 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
          >
            <ArrowLeft size={12} aria-hidden /> Channels
          </Link>
          <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
            <Lock size={13} className="text-moss-600" aria-hidden />
            {data.channel.title}
          </p>
        </div>
        <p className="text-xs text-muted">
          {data.members.length} member{data.members.length === 1 ? "" : "s"} · AES-GCM
        </p>
      </div>

      <div className="scroll-slim flex-1 space-y-3 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="py-10 text-center text-xs text-muted">
            No messages yet — everything you send is encrypted in this browser first.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === data.myId;
          const text = plain.get(m.id) ?? "…";
          return (
            <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-lg border px-3 py-2 text-sm",
                  mine ? "border-jade-300 bg-accent/30 dark:border-jade-700 dark:bg-jade-900/30" : "border-line bg-card"
                )}
              >
                {!mine && (
                  <p className="mb-1 text-[11px] font-medium text-muted">{m.sender_name}</p>
                )}
                {m.kind === "image" ? (
                  <ImageBubble message={m} preview={previewImage} />
                ) : m.kind === "file" ? (
                  <button
                    onClick={() => void download(m)}
                    className="flex items-center gap-2 text-munsell-600 hover:underline"
                  >
                    <FileIcon size={14} aria-hidden />
                    <span className="truncate">{String(m.media_meta?.name ?? "file")}</span>
                    <Download size={13} aria-hidden />
                  </button>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{text}</p>
                )}
                <p className="mt-1 text-right text-[10px] text-muted">
                  {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!data.isMember ? (
        <p className="border-t border-line py-3 text-center text-xs text-muted">
          You are not a member of this channel — ask the owner to add you.
        </p>
      ) : (
        <div className="border-t border-line py-3">
          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f, "file");
              }}
            />
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f, "image");
              }}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Send encrypted file"
            >
              <FileIcon size={16} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => imageRef.current?.click()}
              disabled={uploading}
              aria-label="Send encrypted image"
            >
              <ImageIcon size={16} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.push({ kind: "info", title: "Voice notes — coming next drop" })}
              aria-label="Voice note (coming soon)"
            >
              <Mic size={16} aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toast.push({ kind: "info", title: "Video calls — coming next drop" })}
              aria-label="Video call (coming soon)"
            >
              <Video size={16} aria-hidden />
            </Button>
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={uploading ? "Encrypting upload…" : "Type a message…"}
              aria-label="Message"
            />
            <Button size="sm" onClick={() => void send()} loading={sending} disabled={!draft.trim()}>
              <Send size={15} aria-hidden />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ImageBubble({
  message,
  preview,
}: {
  message: RoomMessage;
  preview: (m: RoomMessage) => Promise<string>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    preview(message)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [message, preview]);

  if (!url) {
    return (
      <p className="flex items-center gap-2 text-xs text-muted">
        <ImageIcon size={13} aria-hidden /> decrypting image…
      </p>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={String(message.media_meta?.name ?? "image")} className="max-h-64 rounded-lg" />;
}
