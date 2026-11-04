"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LogOut, Save, UserRound } from "lucide-react";
import { Badge, Button, Card, Input, Label, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface SettingsUser {
  id: string;
  email: string;
  full_name: string;
  username: string;
  kind: string;
  provider: string;
  student_tag?: string | null;
}

export default function SettingsClient({ user }: { user: SettingsUser }) {
  const router = useRouter();
  const toast = useToast();

  const [fullName, setFullName] = useState(user.full_name);
  const [username, setUsername] = useState(user.username);
  const [savingProfile, setSavingProfile] = useState(false);

  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [savingPw, setSavingPw] = useState(false);

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
      </div>
    </div>
  );
}
