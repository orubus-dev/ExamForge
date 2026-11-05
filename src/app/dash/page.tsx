import { redirect } from "next/navigation";
import { getViewer, primaryRole } from "@/lib/session";
import { roleHome } from "@/components/AppShell";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** /dash — legacy entry; routes each role to its own dashboard. */
export default async function DashPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  redirect(roleHome(role ?? "independent"));
}
