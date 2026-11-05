import { AppShell } from "@/components/AppShell";
import { StudentView, type DashData } from "@/components/dash/DashClient";
import { loadRolePage } from "@/lib/dashData";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function StudentDashboardPage() {
  const { data } = await loadRolePage(["student"]);
  return (
    <AppShell viewer={data}>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Student dashboard</h1>
      </div>
      <StudentView data={data as DashData} />
    </AppShell>
  );
}
