import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import EditExamClient, { type EditExamData } from "@/components/exams/EditExamClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseServer } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import { examAccess } from "@/lib/examAccess";
import type { ClassRow, Exam, Question } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function EditExamPage({
  params,
}: {
  params: { id: string };
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  if (role !== "teacher" && role !== "org_admin") redirect("/dash");

  const admin = supabaseAdmin();
  const row = await admin.from("exams").select("*").eq("id", params.id).maybeSingle();
  const exam = row.data as Exam | null;
  if (!exam || !(await examAccess(exam, viewer.user.id, viewer.memberships))) {
    redirect("/exams");
  }

  const [qres, cres] = await Promise.all([
    admin.from("questions").select("*").eq("exam_id", exam!.id).order("ord"),
    exam!.school_id
      ? supabaseServer().from("classes").select("*").eq("school_id", exam!.school_id).order("name")
      : Promise.resolve({ data: [] as ClassRow[] | null }),
  ]);
  const questions = (qres.data as Question[]) ?? [];
  const classes = (cres.data as ClassRow[] | null) ?? [];
  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);

  const data: EditExamData = {
    exam: {
      id: exam!.id,
      title: exam!.title,
      subject: exam!.subject,
      class_id: exam!.class_id,
      instructions: exam!.instructions,
      status: exam!.status,
      invite_code: exam!.invite_code,
      pin_hash: exam!.pin_hash,
      settings: exam!.settings ?? {},
    },
    questions,
    classes,
  };

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role,
        schoolName: viewer.schools.find((s) => s.id === exam!.school_id)?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <EditExamClient data={data} />
    </AppShell>
  );
}
