import { redirect } from "next/navigation";
import OnboardingClient from "@/components/dash/OnboardingClient";
import { AppShell } from "@/components/AppShell";
import { getViewer } from "@/lib/session";
import { fetchInboxData, unreadCount } from "@/lib/inbox";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);
  const schoolName = viewer.schools[0]?.name ?? null;
  return (
    <AppShell
      contained={false}
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role: "student",
        schoolName,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <OnboardingClient name={viewer.profile?.full_name?.split(" ")[0] ?? ""} />
    </AppShell>
  );
}
