"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

/**
 * Session landing target. supabase-js hydrates the tokens out of the URL
 * fragment (detectSessionInUrl), then we hop to `?next=` or the dashboard.
 */
export default function FinishClient() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  const [error, setError] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let settled = false;
    const go = () => {
      if (!settled) {
        settled = true;
        router.replace(next || "/dash");
      }
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") go();
    });
    const timeout = setTimeout(() => {
      if (!settled) setError(true);
    }, 8000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, next]);

  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-4">
        {error ? (
          <>
            <p className="text-sm font-medium">Signing you in took too long and timed out.</p>
            <Link
              href="/auth"
              className="rounded-lg border border-line px-4 py-2 text-sm transition-colors hover:bg-subtle"
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <div
              className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent"
              aria-hidden
            />
            <p className="text-sm text-muted">Signing you in…</p>
          </>
        )}
      </main>
    </div>
  );
}
