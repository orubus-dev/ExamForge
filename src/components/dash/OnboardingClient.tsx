"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, GraduationCap, BookOpen, ArrowRight, AtSign, UserRound } from "lucide-react";
import { Button, Card, Input, Label, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export interface OnboardingProps {
  name: string;
  username: string;
  fullName: string;
  needsUsername: boolean;
}

/**
 * First-run role selection: student, teacher, or school admin.
 * Teachers never see "create a school" — schools invite them via inbox.
 */
export default function OnboardingClient({ name, username, fullName, needsUsername }: OnboardingProps) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"teach" | "learn" | null>(null);

  const [uname, setUname] = useState(username);
  const [fname, setFname] = useState(fullName);
  const [savingProfile, setSavingProfile] = useState(false);

  const persist = async (kind: "teacher" | "student" | "org_admin") => {
    setSavingProfile(true);
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const patch: Record<string, string> = { kind };
        if (needsUsername && uname.trim().length >= 3) patch.username = uname.trim().toLowerCase();
        if (fname.trim()) patch.full_name = fname.trim();
        if (Object.keys(patch).length > 0) {
          const upd = await supabase.from("profiles").update(patch).eq("id", user.id);
          if (upd.error) throw new Error(upd.error.message);
        }
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const choose = async (kind: "teacher" | "student") => {
    setBusy(kind === "teacher" ? "teach" : "learn");
    try {
      await persist(kind);
      try {
        localStorage.setItem("ef-onboarded", "1");
      } catch {}
      toast.push({
        kind: "success",
        title: kind === "teacher" ? "You're set up to teach" : "You're set up to learn",
        body: "School invites will appear in your inbox.",
      });
      router.replace(kind === "teacher" ? "/teacher/dashboard" : "/student/dashboard");
    } catch (e) {
      setBusy(null);
      toast.push({
        kind: "error",
        title: "Could not save your choice",
        body: e instanceof Error ? e.message : "Please retry.",
      });
    }
  };

  const goSchool = async () => {
    try {
      await persist("org_admin");
    } catch {
      /* continue — the school form will surface any profile issue */
    }
    try {
      localStorage.setItem("ef-onboarded", "1");
    } catch {}
    router.push("/school/new");
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Welcome{name ? `, ${name}` : ""}</h1>
        <Link href="/settings" className="text-xs text-munsell-600 hover:underline">
          Profile settings
        </Link>
      </div>

      {needsUsername && (
        <Card className="mb-4 p-4">
          <p className="text-sm font-medium">Claim your username</p>
          <p className="mt-0.5 text-xs text-muted">
            Schools and classmates address you by it. You can change it later in Settings.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ob-username">
                <span className="inline-flex items-center gap-1"><AtSign size={12} aria-hidden /> Username</span>
              </Label>
              <Input
                id="ob-username"
                value={uname}
                onChange={(e) => setUname(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ""))}
                placeholder="yourname"
              />
            </div>
            <div>
              <Label htmlFor="ob-name">
                <span className="inline-flex items-center gap-1"><UserRound size={12} aria-hidden /> Full name</span>
              </Label>
              <Input
                id="ob-name"
                value={fname}
                onChange={(e) => setFname(e.target.value)}
                placeholder="Ada Lovelace"
              />
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col p-6">
          <BookOpen size={20} className="text-moss-600" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold">I&apos;m a student</h2>
          <p className="mt-1 text-xs text-muted">
            Join with an Exam ID or exam code, wait in the lobby, take exams with autosave.
          </p>
          <div className="mt-4 flex-1" />
          <Button variant="secondary" loading={busy === "learn" || savingProfile} onClick={() => choose("student")} className="w-full">
            I learn
          </Button>
        </Card>

        <Card className="flex flex-col p-6">
          <GraduationCap size={20} className="text-moss-600" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold">I&apos;m a teacher</h2>
          <p className="mt-1 text-xs text-muted">
            Create exams, admit students, run live sessions. A school invites you to unlock
            everything — the invite lands in your inbox.
          </p>
          <div className="mt-4 flex-1" />
          <Button variant="secondary" loading={busy === "teach" || savingProfile} onClick={() => choose("teacher")} className="w-full">
            I teach
          </Button>
        </Card>

        <Card className="flex flex-col p-6">
          <Building2 size={20} className="text-moss-600" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold">We&apos;re a school</h2>
          <p className="mt-1 text-xs text-muted">
            Create your organisation — classes, teachers, student accounts, broadcasts and billing
            in one console.
          </p>
          <div className="mt-4 flex-1" />
          <Button onClick={goSchool} className="w-full">
            Create a school <ArrowRight size={16} aria-hidden />
          </Button>
        </Card>
      </div>
    </div>
  );
}
