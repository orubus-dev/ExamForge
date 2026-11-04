import { supabaseAdmin } from "./supabase/admin";
import { tierOf } from "./plans";

/**
 * Effective plan tier for a creator: an active subscription (or past_due)
 * wins, otherwise the school's plan, otherwise free.
 */
export async function effectiveTier(
  ownerId: string,
  schoolPlan: string | null
): Promise<"free" | "plus" | "pro" | "enterprise"> {
  let tier = tierOf(schoolPlan);
  try {
    const sub = await supabaseAdmin()
      .from("subscriptions")
      .select("tier,status")
      .eq("owner_id", ownerId)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (sub.data as { tier: string; status: string }[] | null)?.[0];
    if (row && (row.status === "active" || row.status === "past_due")) {
      tier = tierOf(row.tier);
    }
  } catch {
    /* subscriptions table may be absent in some environments */
  }
  return tier;
}
