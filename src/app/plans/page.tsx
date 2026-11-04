import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import PlansClient from "@/components/plans/PlansClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { TIER_LIMITS, tierOf } from "@/lib/plans";
import { effectiveTier } from "@/lib/tiers";
import type { Subscription, Tier } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  const supabase = supabaseServer();

  let currentTier: Tier = "free";
  let subState: { tier: string; status: string } | null = null;
  try {
    const subRes = await supabase
      .from("subscriptions")
      .select("tier,status")
      .eq("owner_id", viewer.user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = (subRes.data as Pick<Subscription, "tier" | "status">[] | null)?.[0];
    if (row) {
      subState = { tier: String(row.tier), status: String(row.status) };
      if (row.status === "active" || row.status === "past_due") currentTier = tierOf(String(row.tier));
    }
  } catch {
    /* subscriptions table may be absent */
  }
  if (!subState || subState.status !== "pending_provider") {
    currentTier = await effectiveTier(
      viewer.user.id,
      viewer.schools[0]?.plan ?? null
    );
  }

  const activeRes = await supabase
    .from("exams")
    .select("id", { count: "exact" })
    .eq("created_by", viewer.user.id)
    .in("status", ["draft", "ready", "live"]);

  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role: role ?? "independent",
        schoolName: viewer.schools[0]?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <PlansClient
        tiers={TIER_LIMITS}
        currentTier={currentTier}
        pendingTier={subState?.status === "pending_provider" ? subState.tier : null}
        activeExams={activeRes.count ?? 0}
      />
    </AppShell>
  );
}
