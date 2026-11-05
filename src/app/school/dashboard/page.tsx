import { AppShell } from "@/components/AppShell";
import { OrgView } from "@/components/dash/DashClient";
import { loadRolePage } from "@/lib/dashData";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function SchoolDashboardPage() {
  const { data } = await loadRolePage(["org_admin"]);
  return (
    <AppShell viewer={data}>
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight">School dashboard</h1>
      </div>
      <OrgView data={data} />
    </AppShell>
  );
}
