import { redirect } from "next/navigation";
import { AppShell, ThemeToggle } from "@/components/AppShell";
import SettingsClient from "@/components/settings/SettingsClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { TIER_LIMITS } from "@/lib/plans";
import { effectiveTier } from "@/lib/tiers";
import type { Tier } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  // Plan info — staff only. Students never see plans.
  let plan: { current: Tier; activeExams: number } | null = null;
  if (role === "org_admin" || role === "teacher") {
    const current = await effectiveTier(viewer.user.id, viewer.schools[0]?.plan ?? null);
    const supabase = supabaseServer();
    const activeRes = await supabase
      .from("exams")
      .select("id", { count: "exact" })
      .eq("created_by", viewer.user.id)
      .in("status", ["draft", "ready", "live"]);
    plan = { current, activeExams: activeRes.count ?? 0 };
  } else {
    // touch supabaseServer import usage for students (no-op)
    void supabaseServer;
  }

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
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <ThemeToggle />
      </div>
      <SettingsClient
        user={{
          id: viewer.user.id,
          email: viewer.user.email ?? "",
          full_name: viewer.profile?.full_name ?? "",
          username: viewer.profile?.username ?? "",
          kind: viewer.profile?.kind ?? "student",
          provider: viewer.profile?.provider ?? "email",
          student_tag: viewer.profile?.student_tag,
        }}
        plan={plan}
        tiers={TIER_LIMITS}
      />
    </AppShell>
  );
}
