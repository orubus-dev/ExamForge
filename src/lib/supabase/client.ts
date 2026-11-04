"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Session is persisted in cookies by @supabase/ssr,
 * so every server route / server component can read the same session.
 */
export function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
