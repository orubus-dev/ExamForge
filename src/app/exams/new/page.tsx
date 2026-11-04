import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import NewExamClient from "@/components/exams/NewExamClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { TIER_LIMITS, tierOf } from "@/lib/plans";
import type { ClassRow, Exam, School } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function NewExamPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  if (role !== "teacher" && role !== "org_admin") redirect("/dash");

  const supabase = supabaseServer();
  const membership =
    viewer.memberships.find((m) => m.role === "org_admin") ??
    viewer.memberships.find((m) => m.role === "teacher");
  if (!membership) redirect("/dash");

  const [classesRes, examsRes, schoolsRes] = await Promise.all([
    supabase.from("classes").select("*").eq("school_id", membership.school_id).order("name"),
    supabase.from("exams").select("id,status").in("status", ["draft", "ready", "live"]),
    supabase.from("schools").select("*").eq("id", membership.school_id).maybeSingle(),
  ]);
  const classes = (classesRes.data as ClassRow[]) ?? [];
  const activeCount = ((examsRes.data as Pick<Exam, "status">[]) ?? []).length;
  const school = (schoolsRes.data as School | null) ?? null;

  // Plan tier: active subscription for this owner, else the school's plan, else free.
  let tier: ReturnType<typeof tierOf> = tierOf(school?.plan);
  try {
    const subRes = await supabase
      .from("subscriptions")
      .select("tier,status")
      .eq("owner_id", viewer.user.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const sub = (subRes.data as { tier: string; status: string }[] | null)?.[0];
    if (sub && (sub.status === "active" || sub.status === "past_due")) tier = tierOf(sub.tier);
  } catch {
    /* subscriptions table may be absent */
  }
  const limits = TIER_LIMITS[tier];
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role,
        schoolName: school?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">New exam</h1>
      </div>
      <NewExamClient
        classes={classes}
        tierLabel={limits.label}
        activeCount={activeCount}
        activeLimit={limits.activeExams}
      />
    </AppShell>
  );
}
