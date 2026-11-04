import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import InboxClient, { type InboxUIData } from "@/components/inbox/InboxClient";
import { getViewer } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData } from "@/lib/inbox";
import type { School } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const supabase = supabaseServer();
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  const schoolIds = Array.from(
    new Set(inbox.invites.map((i) => i.school_id).concat(inbox.messages.map((m) => String(m.payload?.school_id ?? ""))))
  ).filter(Boolean);
  const { data: schoolRows } = await supabase
    .from("schools")
    .select("id,name")
    .in("id", schoolIds.length > 0 ? schoolIds : ["00000000-0000-0000-0000-000000000000"]);
  const schools = new Map(((schoolRows as School[]) ?? []).map((s) => [s.id, s.name]));

  const ui: InboxUIData = {
    invites: inbox.invites.map((i) => ({
      id: i.id,
      role: i.role,
      school_name: schools.get(i.school_id) ?? "A school",
      class_id: i.class_id,
      created_at: i.created_at,
      expires_at: i.expires_at,
    })),
    messages: inbox.messages.map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      body: m.body,
      payload: m.payload,
      read_at: m.read_at,
      created_at: m.created_at,
    })),
  };

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role: viewer.memberships.some((m) => m.role === "org_admin")
          ? "org_admin"
          : viewer.memberships.some((m) => m.role === "teacher")
            ? "teacher"
            : "student",
        schoolName: viewer.schools[0]?.name ?? null,
        unread: 0,
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <InboxClient data={ui} />
    </AppShell>
  );
}
