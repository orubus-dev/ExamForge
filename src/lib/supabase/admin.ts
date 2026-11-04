import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for edge API routes. NEVER import from client code and
 * NEVER surface its errors to users — wrap with `serviceError()` in lib/api.ts.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("missing_service_role_env");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
