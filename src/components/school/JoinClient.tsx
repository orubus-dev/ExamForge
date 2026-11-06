"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, LogIn, ShieldX } from "lucide-react";
import { Badge, Button, Card, useToast } from "@/components/ui";

export interface JoinInfo {
  token: string;
  valid: boolean;
  reason: string | null;
  schoolName: string | null;
  role: "student" | "teacher" | null;
  expiresAt: string | null;
}

/**
 * One-purpose invite link page: confirm and join, or sign in first (the link
 * survives the detour through /auth?next=/join/<token>).
 */
export default function JoinClient({
  info,
  signedIn,
  who,
}: {
  info: JoinInfo;
  signedIn: boolean;
  who: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [joined, setJoined] = useState(false);

  const join = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/org/invite-link/redeem", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token: info.token }),
      });
      const body = (await res.json()) as { ok?: boolean; status?: string; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not join — try again.");
      setJoined(true);
      toast.push({
        kind: "success",
        title: body.status === "already_member" ? "You're already in" : `Welcome to ${info.schoolName}`,
        body: "Taking you to your dashboard…",
      });
      router.replace("/dash");
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Could not join",
        body: e instanceof Error ? e.message : "Please retry.",
      });
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <div className="mb-6 flex items-center justify-center gap-1 text-[15px] font-bold tracking-tight">
          <span>Exam</span>
          <span className="rounded-md bg-accent px-1 py-0.5 text-[var(--accent-ink)]">Forge</span>
        </div>

        {!info.valid ? (
          <Card className="p-6 text-center">
            <ShieldX size={24} className="mx-auto text-dogwood-500" aria-hidden />
            <h1 className="mt-3 text-lg font-semibold">This link doesn&apos;t work</h1>
            <p className="mt-1 text-sm text-muted">{info.reason}</p>
            <Link
              href="/auth"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-lg border border-line px-4 text-sm transition-colors hover:bg-subtle"
            >
              Go to sign in
            </Link>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="flex items-center gap-2">
              <Building2 size={18} className="text-moss-600" aria-hidden />
              <h1 className="text-lg font-semibold">{info.schoolName}</h1>
            </div>
            <p className="mt-2 text-sm text-muted">
              You&apos;ve been invited to join this school on ExamForge
              {info.role ? ` as a ${info.role}` : ""}.
              {info.expiresAt
                ? ` The link is open until ${new Date(info.expiresAt).toLocaleDateString()}.`
                : ""}
            </p>

            {joined ? (
              <p className="mt-4 flex items-center gap-2 text-sm font-medium text-moss-600">
                <CheckCircle2 size={16} aria-hidden /> Joined — heading to your dashboard…
              </p>
            ) : signedIn ? (
              <>
                <p className="mt-3 text-xs text-muted">
                  Signed in as <span className="font-medium text-foreground">{who ?? "you"}</span>.
                </p>
                <Button className="mt-4 w-full" loading={busy} onClick={join}>
                  Join {info.role === "teacher" ? "as a teacher" : "as a student"}
                </Button>
              </>
            ) : (
              <>
                <p className="mt-3 text-xs text-muted">
                  Sign in first — ExamForge will bring you straight back here.
                </p>
                <Link
                  href={`/auth?next=${encodeURIComponent(`/join/${info.token}`)}`}
                  className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-strong)]"
                >
                  <LogIn size={16} aria-hidden /> Sign in to join
                </Link>
              </>
            )}
          </Card>
        )}

        <p className="mt-6 text-center text-[11px] text-muted">
          <Badge tone="neutral">Schools</Badge> invite links are issued by the school admin and can be
          revoked any time.
        </p>
      </main>
    </div>
  );
}
