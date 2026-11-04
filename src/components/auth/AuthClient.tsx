"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sparkles, Waves, School, Mail, KeyRound } from "lucide-react";
import { Button, Card, Input, Label, Tabs, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

type Step = "idle" | "relay-email" | "relay-otp";

export default function AuthClient({ initialMode }: { initialMode: "signin" | "signup" }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Relay flow
  const [step, setStep] = useState<Step>("idle");
  const [email, setEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [otp, setOtp] = useState("");

  // Secondary sections
  const [tab, setTab] = useState<string>(initialMode === "signup" ? "email" : "none");
  const [emailTab, setEmailTab] = useState<"signin" | "signup">(initialMode);
  const [password, setPassword] = useState("");
  const [tag, setTag] = useState("");

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dash");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") router.replace("/dash");
    });
    return () => sub.subscription.unsubscribe();
  }, [router]);

  const startRelay = () => {
    setError(null);
    setStep("relay-email");
  };

  const sendRelayOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/relay/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = (await res.json()) as { challenge_id?: string; error?: string };
      if (!res.ok || !body.challenge_id) throw new Error(body.error ?? "Could not send the code");
      setChallengeId(body.challenge_id);
      setStep("relay-otp");
      toast.push({ kind: "info", title: "Code sent", body: `Check ${email} for your one-time code.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not send the code");
    } finally {
      setBusy(false);
    }
  };

  const verifyRelay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/relay/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challenge_id: challengeId, code: otp }),
      });
      const body = (await res.json()) as { redirect_url?: string; error?: string };
      if (!res.ok || !body.redirect_url) throw new Error(body.error ?? "Verification failed");
      window.location.href = body.redirect_url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Verification failed");
      setBusy(false);
    }
  };

  const emailSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = supabaseBrowser();
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) throw new Error(err.message);
      router.replace("/dash");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  };

  const emailSignUp = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = supabaseBrowser();
      const { data, error: err } = await supabase.auth.signUp({ email, password });
      if (err) throw new Error(err.message);
      if (data.session) {
        router.replace("/dash");
        return;
      }
      toast.push({
        kind: "info",
        title: "Confirm your email",
        body: "We sent a confirmation link — verify, then sign in.",
      });
      setEmailTab("signin");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-up failed");
    } finally {
      setBusy(false);
    }
  };

  const schoolSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/school", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tag, password }),
      });
      const body = (await res.json()) as {
        session?: { access_token: string; refresh_token: string };
        error?: string;
      };
      if (!res.ok || !body.session) throw new Error(body.error ?? "Sign-in failed");
      const supabase = supabaseBrowser();
      const { error: err } = await supabase.auth.setSession({
        access_token: body.session.access_token,
        refresh_token: body.session.refresh_token,
      });
      if (err) throw new Error(err.message);
      router.replace("/dash");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-1 text-[15px] font-bold tracking-tight">
            <span>Exam</span>
            <span className="rounded-md bg-accent px-1 py-0.5 text-[var(--accent-ink)]">Forge</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-12">
        <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>

        <div className="mt-6 space-y-3">
          <a
            href="/api/auth/genjutsu"
            aria-label="Continue with Genjutsu"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-[15px] font-semibold text-[var(--accent-ink)] transition-colors hover:bg-[var(--accent-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-jade-500"
          >
            <Sparkles size={18} aria-hidden />
            Continue with Genjutsu
          </a>
          <Button variant="secondary" size="lg" className="w-full" onClick={startRelay}>
            <Waves size={18} aria-hidden />
            Continue with Relay
          </Button>
        </div>

        {step === "relay-email" && (
          <Card className="mt-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Mail size={16} className="text-muted" aria-hidden />
              Relay sign-in
            </div>
            <div className="mt-3">
              <Label htmlFor="relay-email">Email</Label>
              <Input
                id="relay-email"
                type="email"
                autoComplete="email"
                placeholder="you@school.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("idle")}>
                Cancel
              </Button>
              <Button size="sm" loading={busy} onClick={sendRelayOtp} disabled={!email.includes("@")}>
                Send code
              </Button>
            </div>
          </Card>
        )}

        {step === "relay-otp" && (
          <Card className="mt-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <KeyRound size={16} className="text-muted" aria-hidden />
              Enter the 6-digit code
            </div>
            <p className="mt-1 text-xs text-muted">Sent to {email}</p>
            <div className="mt-3">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 8))}
                className="text-center font-mono text-lg tracking-widest"
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("relay-email")}>
                Back
              </Button>
              <Button size="sm" loading={busy} onClick={verifyRelay} disabled={otp.length < 4}>
                Verify
              </Button>
            </div>
          </Card>
        )}

        <div className="mt-6">
          <Tabs
            items={[
              { id: "email", label: "Use email instead" },
              { id: "school", label: "School account" },
            ]}
            value={tab}
            onChange={(v) => setTab((prev) => (prev === v ? "none" : v))}
          />
        </div>

        {tab === "email" && (
          <Card className="mt-3 p-4">
            <Tabs
              items={[
                { id: "signin", label: "Sign in" },
                { id: "signup", label: "Create account" },
              ]}
              value={emailTab}
              onChange={(v) => setEmailTab(v as "signin" | "signup")}
            />
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="auth-email">Email</Label>
                <Input
                  id="auth-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="auth-password">Password</Label>
                <Input
                  id="auth-password"
                  type="password"
                  autoComplete={emailTab === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                loading={busy}
                onClick={emailTab === "signin" ? emailSignIn : emailSignUp}
                disabled={!email || !password}
              >
                {emailTab === "signin" ? "Sign in" : "Create account"}
              </Button>
            </div>
          </Card>
        )}

        {tab === "school" && (
          <Card className="mt-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <School size={16} className="text-muted" aria-hidden />
              School-issued account
            </div>
            <p className="mt-1 text-xs text-muted">
              Sign in with the Exam ID your school gave you (e.g. SCHCLSJAN).
            </p>
            <div className="mt-3 space-y-3">
              <div>
                <Label htmlFor="school-tag">Exam ID</Label>
                <Input
                  id="school-tag"
                  autoComplete="username"
                  placeholder="SCHCLSJAN"
                  value={tag}
                  onChange={(e) => setTag(e.target.value.toUpperCase())}
                  className="font-mono"
                />
              </div>
              <div>
                <Label htmlFor="school-password">Password</Label>
                <Input
                  id="school-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                loading={busy}
                onClick={schoolSignIn}
                disabled={!tag || !password}
              >
                Sign in
              </Button>
            </div>
          </Card>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-dogwood-200 bg-dogwood-50 px-3 py-2 text-xs text-dogwood-900 dark:border-dogwood-800 dark:bg-dogwood-900/30 dark:text-dogwood-100">
            {error}
          </p>
        )}
      </main>

      <footer className="mt-auto border-t border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">
          ExamForge — lightweight CBT for schools
        </div>
      </footer>
    </div>
  );
}
