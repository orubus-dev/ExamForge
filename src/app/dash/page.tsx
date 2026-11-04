import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import DashClient, { type DashData, type DashExam } from "@/components/dash/DashClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import type { Exam } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function DashPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");

  const supabase = supabaseServer();
  const role = primaryRole(viewer);
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  const membership =
    viewer.memberships.find((m) => m.role === "org_admin") ??
    viewer.memberships.find((m) => m.role === "teacher") ??
    viewer.memberships[0];
  const school = viewer.schools.find((s) => s.id === membership?.school_id) ?? null;

  let exams: DashExam[] = [];
  let classNames: string[] = [];
  let counts = { members: 0, classes: 0, invites: 0 };

  if (role === "student" && membership) {
    const { data } = await supabase
      .from("exams")
      .select("id,title,subject,status,invite_code,created_at")
      .eq("status", "live")
      .order("created_at", { ascending: false })
      .limit(20);
    exams = ((data as Exam[]) ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      subject: e.subject,
      status: e.status,
      invite_code: e.invite_code,
      created_at: e.created_at,
    }));
  }

  if (role === "teacher" && membership) {
    const { data } = await supabase
      .from("exams")
      .select("id,title,subject,status,invite_code,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    exams = ((data as Exam[]) ?? []).map((e) => ({
      id: e.id,
      title: e.title,
      subject: e.subject,
      status: e.status,
      invite_code: e.invite_code,
      created_at: e.created_at,
    }));
    const { data: classes } = await supabase
      .from("classes")
      .select("id,name,short_code")
      .order("name");
    classNames = (classes as { name: string }[] ?? []).map((c) => c.name);
  }

  if (role === "org_admin" && membership) {
    const [members, classes, invites] = await Promise.all([
      supabase.from("school_members").select("id", { count: "exact" }).eq("school_id", membership.school_id),
      supabase.from("classes").select("id", { count: "exact" }).eq("school_id", membership.school_id),
      supabase.from("school_invites").select("id", { count: "exact" }).eq("school_id", membership.school_id).eq("status", "pending"),
    ]);
    counts = {
      members: members.count ?? 0,
      classes: classes.count ?? 0,
      invites: invites.count ?? 0,
    };
  }

  const data: DashData = {
    name: viewer.profile?.full_name || viewer.user.email || "you",
    role: role ?? "independent",
    schoolName: school?.name ?? null,
    unread: unreadCount(inbox),
    studentTag: viewer.profile?.student_tag ?? null,
    kind: viewer.profile?.kind ?? "student",
    hasMemberships: viewer.memberships.length > 0,
    exams,
    classNames,
    counts,
  };

  return (
    <AppShell viewer={data}>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
      </div>
      <DashClient {...data} />
    </AppShell>
  );
}
