import { redirect } from "next/navigation";
import AuthClient from "@/components/auth/AuthClient";
import { getViewer } from "@/lib/session";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: { mode?: string };
}) {
  const viewer = await getViewer();
  if (viewer) redirect("/dash");
  const mode = searchParams?.mode === "signup" ? "signup" : "signin";
  return <AuthClient initialMode={mode} />;
}
