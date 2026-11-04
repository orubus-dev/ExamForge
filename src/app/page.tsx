import Link from "next/link";
import { ShieldCheck, MonitorSmartphone, LockKeyhole, FileText } from "lucide-react";
import { Card } from "@/components/ui";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <span className="flex items-center gap-1 text-[15px] font-bold tracking-tight">
            <span>Exam</span>
            <span className="rounded-md bg-accent px-1 py-0.5 text-[var(--accent-ink)]">Forge</span>
          </span>
          <Link
            href="/auth"
            className="rounded-lg border border-line px-3 py-1.5 text-sm transition-colors hover:bg-subtle"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-20 text-center sm:px-6 sm:pt-28">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">ExamForge</h1>
          <p className="mx-auto mt-4 max-w-xl text-muted">
            Documents become interactive exams — PIN-secured, autosaved, real-time.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/auth"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-accent px-6 text-[15px] font-medium text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-strong)]"
            >
              Sign in
            </Link>
            <Link
              href="/auth?mode=signup"
              className="inline-flex h-11 items-center justify-center rounded-lg border border-line bg-card px-6 text-[15px] font-medium transition-colors hover:bg-pastel-100 dark:hover:bg-white/5"
            >
              Create account
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card className="p-6">
              <ShieldCheck size={18} className="text-moss-600" />
              <h2 className="mt-3 text-sm font-semibold">PIN-secured sessions</h2>
              <p className="mt-1 text-xs text-muted">
                Readable exam codes (EXM-XXXXXX) plus a 4–6 digit PIN. Waiting-room gate before
                start.
              </p>
            </Card>
            <Card className="p-6">
              <MonitorSmartphone size={18} className="text-moss-600" />
              <h2 className="mt-3 text-sm font-semibold">Real-time monitor</h2>
              <p className="mt-1 text-xs text-muted">
                Watch joins, progress and tab-blur events live. Start and close exams when you
                choose.
              </p>
            </Card>
            <Card className="p-6">
              <LockKeyhole size={18} className="text-moss-600" />
              <h2 className="mt-3 text-sm font-semibold">Encrypted channels</h2>
              <p className="mt-1 text-xs text-muted">
                Student–teacher messaging with per-channel AES-GCM encryption done in the browser.
              </p>
            </Card>
          </div>

          <div className="mt-10 flex items-center justify-center gap-2 text-xs text-muted">
            <FileText size={14} aria-hidden />
            <span>Paste text, drop a .pdf, or snap a photo — ExamForge drafts the questions.</span>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-xs text-muted sm:px-6">
          <span>ExamForge — lightweight CBT for schools</span>
          <span>examforage.pages.dev</span>
        </div>
      </footer>
    </div>
  );
}
