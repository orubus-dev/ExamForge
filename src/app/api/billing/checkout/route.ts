import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import type { Subscription } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  tier: z.enum(["free", "plus", "pro", "enterprise"]),
  school_id: z.string().uuid().optional(),
});

/**
 * Billing checkout. The payment provider wiring is still in progress — the
 * chosen tier is recorded as a pending_provider subscription so the account
 * already reflects intent, and the UI explains the state.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { tier, school_id } = parsed.data;

  try {
    const admin = supabaseAdmin();
    const ins = await admin
      .from("subscriptions")
      .insert({
        owner_id: auth.user.id,
        school_id: school_id ?? null,
        tier,
        status: "pending_provider",
        limits: {},
      })
      .select("id")
      .single();
    if (ins.error) return bad("Could not record the subscription.", 400);

    return ok({
      ok: true,
      subscription_id: ins.data.id,
      message: "Checkout wiring in progress — tier saved",
    });
  } catch (e) {
    console.error("[examforge:billing-checkout]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}

/** Show my latest subscription (read-friendly for the Plans page). */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const rows = await supabaseAdmin()
    .from("subscriptions")
    .select("*")
    .eq("owner_id", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(1);
  const sub = (rows.data as Subscription[] | null)?.[0] ?? null;
  return ok({ subscription: sub });
}
