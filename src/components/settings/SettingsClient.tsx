"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Save, UserRound, BookOpen, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Label, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";
import type { TierInfo } from "@/lib/plans";
import type { Tier } from "@/lib/types";

export interface SettingsUser {
  id: string;
  email: string;
  full_name: string;
  username: string;
  kind: string;
  provider: string;
  student_tag?: string | null;
}

export interface SettingsPlan {
  current: Tier;
  activeExams: number;
}

export default function SettingsClient({
  user,
  plan,
  tiers,
}: {
  user: SettingsUser;
  plan?: SettingsPlan | null;
  tiers?: Record<Tier, TierInfo>;
}) {
  const router = useRouter();
  const toast = useToast();

  const [fullName, setFullName] = useState(user.full_name);
  const [username, setUsername] = useState(user.username);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      const supabase = supabaseBrowser();
      const upd = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          ...(username.trim() ? { username: username.trim().toLowerCase() } : {}),
        })
        .eq("id", user.id);
      if (upd.error) throw new Error(upd.error.message);
      toast.push({ kind: "success", title: "Profile saved" });
      router.refresh();
    } catch (e) {
      toast.push({ kind: "error", title: "Save failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    if (pw.length < 6) {
      toast.push({ kind: "error", title: "Password too short", body: "Use at least 6 characters." });
      return;
    }
    if (pw !== pw2) {
      toast.push({ kind: "error", title: "Passwords don't match" });
      return;
    }
    setSavingPw(true);
    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw new Error(error.message);
      toast.push({ kind: "success", title: "Password updated" });
      setPw("");
      setPw2("");
    } catch (e) {
      toast.push({ kind: "error", title: "Update failed", body: e instanceof Error ? e.message : undefined });
    } finally {
      setSavingPw(false);
    }
  };

  const signOut = async () => {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.replace("/");
  };

  const deleteAccount = async () => {
    if (confirmText !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch("/api/users/delete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: "DELETE" }),
      });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Could not delete the account.");
      // Local session is dead either way — clear it and leave.
      const supabase = supabaseBrowser();
      await supabase.auth.signOut();
      router.replace("/");
    } catch (e) {
      toast.push({
        kind: "error",
        title: "Delete failed",
        body: e instanceof Error ? e.message : "Please retry.",
      });
      setDeleting(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-6">
        <div className="flex items-center gap-2">
          <UserRound size={16} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Profile</h2>
        </div>
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span>{user.email}</span>
            <Badge tone="info">{user.kind}</Badge>
            <Badge tone="neutral">{user.provider}</Badge>
          </div>
          <div>
            <Label htmlFor="pf-name">Full name</Label>
            <Input id="pf-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="pf-username">Username</Label>
            <Input
              id="pf-username"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ""))}
              placeholder="how you're addressed by invites"
            />
          </div>
          {user.student_tag && (
            <p className="text-xs text-muted">
              Exam ID: <span className="font-mono font-medium">{user.student_tag}</span>
            </p>
          )}
          <Button onClick={saveProfile} loading={savingProfile}>
            <Save size={15} aria-hidden /> Save profile
          </Button>
        </div>
      </Card>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-moss-600" aria-hidden />
            <h2 className="text-sm font-semibold">Change password</h2>
          </div>
          <div className="mt-3 space-y-3">
            <div>
              <Label htmlFor="pw-new">New password</Label>
              <Input
                id="pw-new"
                type="password"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="pw-confirm">Confirm new password</Label>
              <Input
                id="pw-confirm"
                type="password"
                autoComplete="new-password"
                value={pw2}
                onChange={(e) => setPw2(e.target.value)}
              />
            </div>
            <Button onClick={changePassword} loading={savingPw} disabled={!pw || !pw2}>
              Update password
            </Button>
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-sm font-semibold">Session</h2>
          <p className="mt-1 text-xs text-muted">
            Signing out clears this browser&apos;s ExamForge session.
          </p>
          <Button variant="danger" className="mt-3" onClick={signOut}>
            <LogOut size={15} aria-hidden /> Sign out
          </Button>
        </Card>

        <Card className="border-dogwood-300 p-6 dark:border-dogwood-700">
          <div className="flex items-center gap-2">
            <Trash2 size={16} className="text-dogwood-500" aria-hidden />
            <h2 className="text-sm font-semibold">Danger zone</h2>
          </div>
          <p className="mt-1 text-xs text-muted">
            Deleting your account is permanent: your profile, exams, results, messages and school
            memberships are removed. A school you own is wound down with it. This cannot be undone.
          </p>
          <div className="mt-3">
            <Label htmlFor="del-confirm">
              Type <span className="font-mono font-semibold">DELETE</span> to confirm
            </Label>
            <Input
              id="del-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
              placeholder="DELETE"
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <Button
            variant="danger"
            className="mt-3"
            loading={deleting}
            disabled={confirmText !== "DELETE"}
            onClick={deleteAccount}
          >
            Delete my account forever
          </Button>
        </Card>
      </div>

      {plan && tiers && (
        <div className="lg:col-span-2" id="plan">
          <PlanCard plan={plan} tiers={tiers} />
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────── plan (staff)

function PlanCard({ plan, tiers }: { plan: SettingsPlan; tiers: Record<Tier, TierInfo> }) {
  const order: Tier[] = ["free", "plus", "pro", "enterprise"];
  const cur = plan.current;
  const limits = tiers[cur];

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BookOpen size={16} className="text-moss-600" aria-hidden />
          <h2 className="text-sm font-semibold">Your plan</h2>
        </div>
        <Badge tone={cur === "free" ? "neutral" : "success"}>
          {limits.label} · {plan.activeExams} active exam{plan.activeExams === 1 ? "" : "s"}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted">
        What {limits.label} includes right now: {limits.features.join(" · ")}.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {order.map((t) => {
          const info = tiers[t];
          const isCurrent = t === cur;
          return (
            <div
              key={t}
              className={
                isCurrent
                  ? "rounded-lg border border-jade-300 bg-jade-50/60 p-3 dark:border-jade-700 dark:bg-jade-900/20"
                  : "rounded-lg border border-line p-3"
              }
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">{info.label}</p>
                {isCurrent ? <Badge tone="success">current</Badge> : null}
              </div>
              <p className="mt-0.5 text-xs text-muted">{info.tagline}</p>
              <p className="mt-2 text-sm font-medium">{info.price}</p>
              <ul className="mt-2 space-y-1 text-[11px] text-muted">
                <li>{info.activeExams.toLocaleString()} active exams</li>
                <li>{info.studentsPerExam.toLocaleString()} students / exam</li>
                <li>{info.ocr}</li>
              </ul>
              {!isCurrent && t === "enterprise" && (
                <a
                  href="mailto:benjaminchume@gmail.com?subject=ExamForge%20Enterprise"
                  className="mt-3 inline-flex h-8 items-center justify-center rounded-lg border border-line bg-card px-3 text-xs font-medium transition-colors hover:bg-subtle"
                >
                  Talk to us
                </a>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-muted">
        Upgrades are switched on manually for now — no card is charged in-app. Message us and your
        school&apos;s tier changes immediately.
      </p>
    </Card>
  );
}
