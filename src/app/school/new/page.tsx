import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import CreateSchoolClient from "@/components/school/CreateSchoolClient";
import { getViewer, primaryRole } from "@/lib/session";
import { roleHome } from "@/components/AppShell";
import { fetchInboxData, unreadCount } from "@/lib/inbox";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function NewSchoolPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");

  const orgMembership = viewer.memberships.find((m) => m.role === "org_admin");
  if (orgMembership) redirect("/school");

  const role = primaryRole(viewer);
  if (role && role !== "org_admin") redirect(roleHome(role));

  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role: role ?? "independent",
        schoolName: null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Create your school</h1>
      </div>
      <CreateSchoolClient />
    </AppShell>
  );
}
