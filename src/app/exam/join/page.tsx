import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import JoinClient from "@/components/exam/JoinClient";
import { getViewer, primaryRole } from "@/lib/session";
import { fetchInboxData, unreadCount } from "@/lib/inbox";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function JoinExamPage({
  searchParams,
}: {
  searchParams?: { code?: string };
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth?next=join");
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
      contained={false}
    >
      <JoinClient
        initialCode={(searchParams?.code ?? "").toUpperCase()}
        schoolName={viewer.schools[0]?.name ?? null}
        isStudent={role === "student"}
      />
    </AppShell>
  );
}
