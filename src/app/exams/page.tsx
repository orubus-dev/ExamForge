import { redirect } from "next/navigation";
import Link from "next/link";
import { FileStack, Monitor, Plus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, EmptyState, linkClass } from "@/components/ui";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { STATUS_LABEL, STATUS_TONE, fmtDate } from "@/lib/utils";
import type { Exam } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ExamsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  if (role !== "teacher" && role !== "org_admin") redirect("/dash");

  const supabase = supabaseServer();
  const membership =
    viewer.memberships.find((m) => m.role === "org_admin") ??
    viewer.memberships.find((m) => m.role === "teacher");
  if (!membership) redirect("/dash");

  const { data: examRows } = await supabase
    .from("exams")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const exams = (examRows as Exam[]) ?? [];
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role,
        schoolName: viewer.schools.find((s) => s.id === membership.school_id)?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Exams</h1>
        <Link href="/exams/new" className={linkClass("primary", "sm")}>
          <Plus size={16} aria-hidden /> New exam
        </Link>
      </div>

      {exams.length === 0 ? (
        <EmptyState
          icon={<FileStack size={24} />}
          title="No exams yet"
          hint="Create an exam, paste a document, and set it ready."
          action={
            <Link href="/exams/new" className={linkClass("primary", "sm")}>
              <Plus size={16} aria-hidden /> New exam
            </Link>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="scroll-slim max-h-[36rem] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-line text-left text-xs text-muted">
                  <th className="px-4 py-2.5 font-medium">Title</th>
                  <th className="px-4 py-2.5 font-medium">Code</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Created</th>
                  <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.map((ex) => (
                  <tr key={ex.id} className="border-b border-line/60 last:border-0">
                    <td className="max-w-72 truncate px-4 py-2.5">
                      <span className="font-medium">{ex.title}</span>
                      {ex.subject && (
                        <span className="ml-2 text-xs text-muted">{ex.subject}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs">{ex.invite_code}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={STATUS_TONE[ex.status]}>{STATUS_LABEL[ex.status]}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-muted">{fmtDate(ex.created_at)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        <Link href={`/exams/${ex.id}/edit`} className={linkClass("secondary", "sm")}>
                          Edit
                        </Link>
                        {(ex.status === "ready" || ex.status === "live") && (
                          <Link
                            href={`/exams/${ex.id}/monitor`}
                            className={linkClass("secondary", "sm")}
                            aria-label={`Monitor ${ex.title}`}
                          >
                            <Monitor size={14} aria-hidden /> Monitor
                          </Link>
                        )}
                        {(ex.status === "closed" || ex.status === "graded") && (
                          <Link
                            href={`/results/${ex.id}`}
                            className={linkClass("secondary", "sm")}
                          >
                            Results
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppShell>
  );
}
