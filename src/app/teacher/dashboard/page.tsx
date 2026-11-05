import { AppShell } from "@/components/AppShell";
import { TeacherView } from "@/components/dash/DashClient";
import { loadRolePage } from "@/lib/dashData";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const { data } = await loadRolePage(["teacher"]);
  return (
    <AppShell viewer={data}>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Teacher dashboard</h1>
      </div>
      <TeacherView data={data} />
    </AppShell>
  );
}
