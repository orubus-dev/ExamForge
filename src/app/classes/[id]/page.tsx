import { redirect } from "next/navigation";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileStack } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Badge, Card, EmptyState, linkClass } from "@/components/ui";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/utils";
import type { ClassRow, Exam, Profile, SchoolMember } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ClassDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  if (role !== "teacher" && role !== "org_admin") redirect("/dash");

  const supabase = supabaseServer();
  const { data: cls } = await supabase
    .from("classes")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!cls) notFound();
  const klass = cls as ClassRow;

  const [rosterRes, examsRes] = await Promise.all([
    supabase
      .from("school_members")
      .select("user_id")
      .eq("school_id", klass.school_id)
      .eq("role", "student")
      .eq("class_id", klass.id),
    supabase.from("exams").select("*").eq("class_id", klass.id).order("created_at", { ascending: false }),
  ]);

  const rosterRows = (rosterRes.data as { user_id: string }[]) ?? [];
  const ids = rosterRows.map((r) => r.user_id);
  let roster: { full_name: string; student_tag: string | null }[] = [];
  if (ids.length > 0) {
    const profRes = await supabase.from("profiles").select("id,full_name,student_tag").in("id", ids);
    roster = ((profRes.data as Profile[]) ?? []).map((p) => ({
      full_name: p.full_name,
      student_tag: p.student_tag,
    }));
  }
  const exams = (examsRes.data as Exam[]) ?? [];
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role,
        schoolName: viewer.schools.find((s) => s.id === klass.school_id)?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <Link
        href="/classes"
        className="mb-4 inline-flex items-center gap-1 text-xs text-muted hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden /> All classes
      </Link>
      <div className="mb-6 flex items-center gap-2">
        <h1 className="text-xl font-semibold tracking-tight">{klass.name}</h1>
        <Badge tone="neutral">{klass.short_code}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-sm font-semibold">Roster</h2>
          <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
            {roster.length === 0 ? (
              <EmptyState title="No students in this class" />
            ) : (
              <ul className="divide-y divide-line">
                {roster.map((r, i) => (
                  <li key={i} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate">{r.full_name || "—"}</span>
                    <span className="font-mono text-xs text-muted">{r.student_tag ?? "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Exams for this class</h2>
            <Link href="/exams/new" className={linkClass("secondary", "sm")}>
              New exam
            </Link>
          </div>
          <div className="scroll-slim mt-3 max-h-96 overflow-y-auto">
            {exams.length === 0 ? (
              <EmptyState icon={<FileStack size={24} />} title="No exams assigned" />
            ) : (
              <ul className="divide-y divide-line">
                {exams.map((ex) => (
                  <li key={ex.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm">{ex.title}</p>
                      <p className="font-mono text-xs text-muted">{ex.invite_code}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={STATUS_TONE[ex.status]}>{STATUS_LABEL[ex.status]}</Badge>
                      <Link href={`/exams/${ex.id}/edit`} className={linkClass("secondary", "sm")}>
                        Edit
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
