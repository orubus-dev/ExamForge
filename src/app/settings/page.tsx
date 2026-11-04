import { redirect } from "next/navigation";
import { AppShell, ThemeToggle } from "@/components/AppShell";
import SettingsClient from "@/components/settings/SettingsClient";
import { getViewer, primaryRole } from "@/lib/session";
import { fetchInboxData, unreadCount } from "@/lib/inbox";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
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
      />
    </AppShell>
  );
}
