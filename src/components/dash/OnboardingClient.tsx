"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, GraduationCap, BookOpen, ArrowRight } from "lucide-react";
import { Button, Card, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function OnboardingClient({ name }: { name: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<"teach" | "learn" | null>(null);

  const choose = async (kind: "teacher" | "student") => {
    setBusy(kind === "teacher" ? "teach" : "learn");
    try {
      const supabase = supabaseBrowser();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ kind }).eq("id", user.id);
      }
      try {
        localStorage.setItem("ef-onboarded", "1");
      } catch {}
      toast.push({
        kind: "success",
        title: kind === "teacher" ? "You're set up to teach" : "You're set up to learn",
        body: "School invites will appear in your inbox.",
      });
      router.replace("/dash");
    } catch {
      setBusy(null);
      toast.push({ kind: "error", title: "Could not save your choice", body: "Please retry." });
    }
  };

  const goSchool = () => {
    try {
      localStorage.setItem("ef-onboarded", "1");
    } catch {}
    router.push("/school");
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Welcome{name ? `, ${name}` : ""}</h1>
        <Link href="/settings" className="text-xs text-munsell-600 hover:underline">
          Profile settings
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col p-6">
          <Building2 size={20} className="text-moss-600" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold">Create a school</h2>
          <p className="mt-1 text-xs text-muted">
            Run exams for your organisation — classes, teachers, students and billing in one
            console.
          </p>
          <div className="mt-4 flex-1" />
          <Button onClick={goSchool} className="w-full">
            Create school <ArrowRight size={16} aria-hidden />
          </Button>
        </Card>

        <Card className="flex flex-col p-6">
          <GraduationCap size={20} className="text-moss-600" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold">Teach</h2>
          <p className="mt-1 text-xs text-muted">
            Join as an independent teacher. Create exams once a school invites you, or start your
            own school anytime.
          </p>
          <div className="mt-4 flex-1" />
          <Button variant="secondary" loading={busy === "teach"} onClick={() => choose("teacher")} className="w-full">
            I teach
          </Button>
        </Card>

        <Card className="flex flex-col p-6">
          <BookOpen size={20} className="text-moss-600" aria-hidden />
          <h2 className="mt-3 text-sm font-semibold">Learn</h2>
          <p className="mt-1 text-xs text-muted">
            Join as a student. Enter exam codes with a PIN, and receive school invites in your
            inbox.
          </p>
          <div className="mt-4 flex-1" />
          <Button variant="secondary" loading={busy === "learn"} onClick={() => choose("student")} className="w-full">
            I learn
          </Button>
        </Card>
      </div>
    </div>
  );
}
