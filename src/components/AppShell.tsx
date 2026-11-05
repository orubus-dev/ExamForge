"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  FileStack,
  GraduationCap,
  Building2,
  MessagesSquare,
  Inbox,
  Settings as SettingsIcon,
  LogOut,
  Moon,
  Sun,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabaseBrowser } from "@/lib/supabase/client";

export type ViewerRole = "org_admin" | "teacher" | "student" | "independent";

export interface ShellViewer {
  name: string;
  role: ViewerRole;
  schoolName: string | null;
  unread: number;
  studentTag: string | null;
}

/** Canonical home for each role. */
export function roleHome(role: ViewerRole): string {
  switch (role) {
    case "org_admin":
      return "/school/dashboard";
    case "teacher":
      return "/teacher/dashboard";
    case "student":
      return "/student/dashboard";
    default:
      return "/onboarding";
  }
}

function Wordmark({ role }: { role: ViewerRole }) {
  const home = role === "independent" ? "/onboarding" : roleHome(role);
  return (
    <Link href={home} className="flex items-center gap-1 text-[15px] font-bold tracking-tight">
      <span>Exam</span>
      <span className="rounded-md bg-accent px-1 py-0.5 text-[var(--accent-ink)]">Forge</span>
    </Link>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);
  const flip = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("ef-theme", next ? "dark" : "light");
    } catch {}
  };
  return (
    <button
      onClick={flip}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-subtle hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400"
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

export function AppShell({
  viewer,
  children,
  contained = true,
}: {
  viewer: ShellViewer;
  children: ReactNode;
  contained?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Role-scoped navigation — students, teachers and schools see different apps.
  const links: { href: string; label: string; icon: ReactNode; badge?: number }[] = [];
  const home = roleHome(viewer.role);
  if (viewer.role === "independent") {
    links.push({ href: "/onboarding", label: "Get set up", icon: <LayoutDashboard size={16} /> });
  } else {
    links.push({ href: home, label: viewer.role === "org_admin" ? "School" : "Dash", icon: <LayoutDashboard size={16} /> });
  }
  if (viewer.role === "org_admin") {
    links.push({ href: "/classes", label: "Classes", icon: <GraduationCap size={16} /> });
    links.push({ href: "/exams", label: "Exams", icon: <FileStack size={16} /> });
  }
  if (viewer.role === "teacher") {
    links.push({ href: "/exams", label: "Exams", icon: <FileStack size={16} /> });
    links.push({ href: "/classes", label: "Classes", icon: <GraduationCap size={16} /> });
  }
  if (viewer.role === "student") {
    links.push({ href: "/exams", label: "Exams", icon: <FileStack size={16} /> });
  }
  links.push({ href: "/channels", label: "Channels", icon: <MessagesSquare size={16} /> });
  links.push({
    href: "/inbox",
    label: "Inbox",
    icon: <Inbox size={16} />,
    badge: viewer.unread > 0 ? viewer.unread : undefined,
  });
  if (viewer.role !== "student") {
    links.push({ href: "/settings#plan", label: "Plans", icon: <BookOpen size={16} /> });
  }
  links.push({ href: "/settings", label: "Settings", icon: <SettingsIcon size={16} /> });

  const signOut = async () => {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.replace("/");
  };

  const active = (href: string) =>
    href === home ? pathname === home : pathname.startsWith(href.split("#")[0]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:px-6">
          <Wordmark role={viewer.role} />
          <nav aria-label="Primary" className="scroll-slim hidden items-center gap-1 overflow-x-auto md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active(l.href) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-sm transition-colors",
                  active(l.href)
                    ? "bg-accent font-medium text-[var(--accent-ink)]"
                    : "text-muted hover:bg-subtle hover:text-foreground"
                )}
              >
                {l.icon}
                {l.label}
                {typeof l.badge === "number" && (
                  <span className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-dogwood-400 px-1 text-[10px] font-semibold text-jet-900">
                    {l.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {viewer.schoolName && (
              <span className="hidden max-w-40 truncate rounded-md border border-line px-2 py-1 text-xs text-muted lg:block">
                {viewer.schoolName}
              </span>
            )}
            <ThemeToggle />
            <button
              onClick={signOut}
              aria-label="Sign out"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-line text-muted transition-colors hover:bg-subtle hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-400"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {/* Mobile nav row */}
        <nav
          aria-label="Primary mobile"
          className="scroll-slim flex items-center gap-1 overflow-x-auto border-t border-line px-4 py-1.5 md:hidden"
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs",
                active(l.href)
                  ? "bg-accent font-medium text-[var(--accent-ink)]"
                  : "text-muted hover:bg-subtle"
              )}
            >
              {l.icon}
              {l.label}
              {typeof l.badge === "number" && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-dogwood-400 px-1 text-[10px] font-semibold text-jet-900">
                  {l.badge}
                </span>
              )}
            </Link>
          ))}
        </nav>
      </header>
      <main className={cn("flex-1", contained && "mx-auto w-full max-w-6xl px-4 py-8 sm:px-6")}>
        {children}
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
