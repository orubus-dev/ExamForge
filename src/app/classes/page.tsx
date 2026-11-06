import { redirect } from "next/navigation";
import Link from "next/link";
import { GraduationCap, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { EmptyState } from "@/components/ui";
import { linkClass } from "@/lib/ui-classes";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import type { ClassRow, SchoolMember } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ClassesPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  if (role !== "teacher" && role !== "org_admin") redirect("/dash");

  const supabase = supabaseServer();
  const membership =
    viewer.memberships.find((m) => m.role === "org_admin") ??
    viewer.memberships.find((m) => m.role === "teacher");
  if (!membership) redirect("/dash");

  const [classesRes, membersRes] = await Promise.all([
    supabase.from("classes").select("*").eq("school_id", membership.school_id).order("name"),
    supabase
      .from("school_members")
      .select("id,class_id")
      .eq("school_id", membership.school_id)
      .eq("role", "student"),
  ]);
  const classes = (classesRes.data as ClassRow[]) ?? [];
  const memberRows = (membersRes.data as Pick<SchoolMember, "id" | "class_id">[]) ?? [];
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
        <h1 className="text-xl font-semibold tracking-tight">Classes</h1>
        {role === "org_admin" && (
          <Link href="/school" className={linkClass("secondary", "sm")}>
            Manage in School console
          </Link>
        )}
      </div>

      {classes.length === 0 ? (
        <EmptyState
          icon={<GraduationCap size={24} />}
          title="No classes yet"
          hint="Classes are created in the school console."
          action={
            role === "org_admin" ? (
              <Link href="/school" className={linkClass("primary", "sm")}>
                Create a class
              </Link>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map((c) => {
            const n = memberRows.filter((m) => m.class_id === c.id).length;
            return (
              <Link
                key={c.id}
                href={`/classes/${c.id}`}
                className="group rounded-lg border border-line bg-card p-6 transition-colors hover:border-jade-300 dark:hover:border-jade-700"
              >
                <div className="flex items-center justify-between">
                  <GraduationCap size={18} className="text-moss-600" aria-hidden />
                  <ArrowRight
                    size={16}
                    className="text-muted opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </div>
                <p className="mt-3 text-sm font-semibold">{c.name}</p>
                <p className="mt-1 text-xs text-muted">
                  <span className="font-mono">{c.short_code}</span> · {n} student{n === 1 ? "" : "s"}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
