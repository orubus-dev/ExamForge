import { redirect } from "next/navigation";
import AuthClient from "@/components/auth/AuthClient";
import { getViewer } from "@/lib/session";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: { mode?: string; next?: string };
}) {
  const viewer = await getViewer();
  if (viewer) {
    // Already signed in — honor an invite-link detour if one is queued.
    const next = searchParams?.next;
    redirect(next && next.startsWith("/") ? next : "/dash");
  }
  const mode = searchParams?.mode === "signup" ? "signup" : "signin";
  return <AuthClient initialMode={mode} />;
}
