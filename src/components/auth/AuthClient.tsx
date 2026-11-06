"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Sparkles, Waves, School, Mail, KeyRound, AtSign, UserRound } from "lucide-react";
import { Badge, Button, Card, Input, Label, Tabs, useToast } from "@/components/ui";
import { supabaseBrowser } from "@/lib/supabase/client";

type Step = "idle" | "relay-user" | "relay-otp";

export default function AuthClient({ initialMode }: { initialMode: "signin" | "signup" }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Where to land after a successful sign-in (e.g. an invite link set ?next=).
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const oauthError = searchParams.get("error");
  const [dismissedOAuthError, setDismissedOAuthError] = useState(false);

  // Relay flow — username first, then the OTP code.
  const [step, setStep] = useState<Step>("idle");
  const [relayUser, setRelayUser] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [destinationHint, setDestinationHint] = useState("");
  const [otp, setOtp] = useState("");

  // Secondary sections
  const [tab, setTab] = useState<string>(initialMode === "signup" ? "email" : "none");
  const [emailTab, setEmailTab] = useState<"signin" | "signup">(initialMode);
  const [identifier, setIdentifier] = useState(""); // email or username
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [tag, setTag] = useState("");

  useEffect(() => {
    const supabase = supabaseBrowser();
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace(nextParam || "/dash");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") router.replace(nextParam || "/dash");
    });
    return () => sub.subscription.unsubscribe();
  }, [router, nextParam]);

  // Surface a failed provider round-trip (Genjutsu callback redirects here).
  const oauthErrorText = oauthError ? oauthErrorMessage(oauthError) : null;

  const startRelay = () => {
    setError(null);
    setStep("relay-user");
  };

  const sendRelayOtp = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/relay/otp", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: relayUser.trim() }),
      });
      const body = (await res.json()) as { challenge_id?: string; destination_hint?: string; error?: string };
      if (!res.ok || !body.challenge_id) throw new Error(body.error ?? "Could not send the code");
      setChallengeId(body.challenge_id);
      setDestinationHint(body.destination_hint ?? "");
      setStep("relay-otp");
      toast.push({ kind: "info", title: "Code sent", body: `ExamForge sent a one-time code to ${body.destination_hint ?? "your"} Relay chats — open Relay to read it.` });
    } catch (e) {
      setError(e instanceof Error ? relayError(e.message) : "Could not send the code");
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
        body: JSON.stringify({ challenge_id: challengeId, code: otp.trim() }),
      });
      const body = (await res.json()) as {
        session?: { access_token: string; refresh_token: string };
        next?: string;
        error?: string;
      };
      if (!res.ok || !body.session) throw new Error(body.error ?? "Verification failed");
      // Direct session — the code the user typed is the whole ceremony.
      const supabase = supabaseBrowser();
      const { error: err } = await supabase.auth.setSession({
        access_token: body.session.access_token,
        refresh_token: body.session.refresh_token,
      });
      if (err) throw new Error(err.message);
      const next = nextParam ?? (body.next || "/dash");
      router.replace(next);
    } catch (e) {
      setError(e instanceof Error ? relayError(e.message) : "Verification failed");
      setBusy(false);
    }
  };

  const passwordSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim(), password }),
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
      router.replace(nextParam || "/dash");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign-in failed");
      setBusy(false);
    }
  };

  const emailSignUp = async () => {
    setBusy(true);
    setError(null);
    try {
      if (username.trim().length < 3) throw new Error("Pick a username (at least 3 characters).");
      const check = await fetch(`/api/auth/username?u=${encodeURIComponent(username.trim())}`);
      const cb = (await check.json()) as { available?: boolean; error?: string };
      if (!check.ok) throw new Error(cb.error ?? "Could not check the username");
      if (!cb.available) throw new Error("That username is taken — try another.");

      const supabase = supabaseBrowser();
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            username: username.trim().toLowerCase(),
            kind: "student",
            provider: "email",
          },
        },
      });
      if (err) throw new Error(err.message);
      if (data.session) {
        // The DB trigger creates the profile; make sure the chosen values stick.
        if (data.user) {
          await supabase
            .from("profiles")
            .update({ username: username.trim().toLowerCase(), full_name: fullName.trim() })
            .eq("id", data.user.id);
        }
        router.replace("/onboarding");
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
      router.replace(nextParam || "/dash");
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

        {step === "relay-user" && (
          <Card className="mt-3 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <AtSign size={16} className="text-muted" aria-hidden />
              Relay sign-in
            </div>
            <p className="mt-1 text-xs text-muted">
              Enter your Relay username — ExamForge sends a one-time code as a chat message from its
              official account to your Relay chats.
            </p>
            <div className="mt-3">
              <Label htmlFor="relay-username">Relay username</Label>
              <div className="relative">
                <AtSign size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
                <Input
                  id="relay-username"
                  autoComplete="username"
                  autoCapitalize="none"
                  placeholder="yourname"
                  className="pl-8"
                  value={relayUser}
                  onChange={(e) => setRelayUser(e.target.value.replace(/\s/g, "").toLowerCase())}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && relayUser.length >= 2) void sendRelayOtp();
                  }}
                />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("idle")}>
                Cancel
              </Button>
              <Button size="sm" loading={busy} onClick={sendRelayOtp} disabled={relayUser.trim().length < 2}>
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
            <p className="mt-1 text-xs text-muted">
              Sent from the official <span className="font-medium">ExamForge</span> business account to{" "}
              {destinationHint || "your Relay account"} — open Relay, then check your chats. Enter the
              code here to sign straight in.
            </p>
            <div className="mt-3">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="••••••"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center font-mono text-lg tracking-widest"
              />
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setStep("relay-user")}>
                Back
              </Button>
              <Button size="sm" loading={busy} onClick={verifyRelay} disabled={otp.length < 6}>
                Verify
              </Button>
            </div>
          </Card>
        )}

        <div className="mt-6">
          <Tabs
            items={[
              { id: "email", label: "Email or username" },
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
            {emailTab === "signin" ? (
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="auth-identifier">Email or username</Label>
                  <Input
                    id="auth-identifier"
                    autoComplete="username"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@school.edu or yourname"
                  />
                </div>
                <div>
                  <Label htmlFor="auth-password">Password</Label>
                  <Input
                    id="auth-password"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  loading={busy}
                  onClick={passwordSignIn}
                  disabled={!identifier || !password}
                >
                  Sign in
                </Button>
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                <div>
                  <Label htmlFor="auth-name">
                    <span className="inline-flex items-center gap-1"><UserRound size={12} aria-hidden /> Full name</span>
                  </Label>
                  <Input
                    id="auth-name"
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ada Lovelace"
                  />
                </div>
                <div>
                  <Label htmlFor="auth-username">
                    <span className="inline-flex items-center gap-1"><AtSign size={12} aria-hidden /> Username</span>
                  </Label>
                  <Input
                    id="auth-username"
                    autoComplete="username"
                    autoCapitalize="none"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ""))}
                    placeholder="how schools address you"
                  />
                </div>
                <div>
                  <Label htmlFor="auth-email">
                    <span className="inline-flex items-center gap-1"><Mail size={12} aria-hidden /> Email</span>
                  </Label>
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
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button
                  className="w-full"
                  loading={busy}
                  onClick={emailSignUp}
                  disabled={!email || !password || !username || !fullName}
                >
                  Create account
                </Button>
              </div>
            )}
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

        {error && !oauthErrorText && !dismissedOAuthError && (
          <p role="alert" className="mt-4 rounded-lg border border-dogwood-200 bg-dogwood-50 px-3 py-2 text-xs text-dogwood-900 dark:border-dogwood-800 dark:bg-dogwood-900/30 dark:text-dogwood-100">
            {error}
          </p>
        )}

        {oauthErrorText && !dismissedOAuthError && (
          <div role="alert" className="mt-4 flex items-start justify-between gap-2 rounded-lg border border-dogwood-200 bg-dogwood-50 px-3 py-2 text-xs text-dogwood-900 dark:border-dogwood-800 dark:bg-dogwood-900/30 dark:text-dogwood-100">
            <span>{oauthErrorText}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => setDismissedOAuthError(true)}
              className="shrink-0 font-medium underline-offset-2 hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        <p className="mt-6 flex items-center justify-center gap-2 text-[11px] text-muted">
          <Badge tone="neutral">Genjutsu</Badge> <Badge tone="neutral">Relay</Badge> secured sign-in — passwords are never shared.
        </p>
      </main>

      <footer className="mt-auto border-t border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-4 text-xs text-muted sm:px-6">
          ExamForge — lightweight CBT for schools
        </div>
      </footer>
    </div>
  );
}

function relayError(code: string): string {
  switch (code) {
    case "unknown_username":
      return "No Relay account has that username.";
    case "invalid_code":
      return "That code is not valid — check the latest ExamForge message in your Relay chats.";
    case "expired":
      return "The code expired — request a new one.";
    case "too_many_attempts":
      return "Too many wrong codes — wait a bit, then request a new one.";
    case "too_many_sends":
      return "Too many codes sent — wait ~15 minutes.";
    case "delivery_failed":
    case "sender_unavailable":
      return "Relay could not deliver the chat message right now — try again shortly.";
    case "already_used":
      return "That code was already used — request a new one.";
    default:
      return code.length < 60 && !code.includes(" ") ? code : "Relay sign-in failed — try again.";
  }
}

function oauthErrorMessage(code: string): string {
  switch (code) {
    case "expired_flow":
      return "The sign-in session timed out — start again from the button above.";
    case "state_mismatch":
      return "That sign-in didn't come back the way it left — start again to stay safe.";
    case "missing_code":
    case "provider_error":
      return "Genjutsu didn't complete the sign-in — start again from the button above.";
    case "token_exchange_failed":
    case "userinfo_failed":
      return "We couldn't read your Genjutsu identity — start again from the button above.";
    case "provider_not_configured":
      return "Genjutsu sign-in isn't configured right now — try Relay or email.";
    case "account_link_failed":
      return "We couldn't link your Genjutsu identity to an ExamForge account — try again, or use Relay.";
    case "session_link_failed":
      return "Sign-in went through but the session didn't start — try once more.";
    case "sign_in_failed":
      return "Sign-in failed on our side — please try again.";
    default:
      return "Sign-in didn't complete — please try again.";
  }
}
