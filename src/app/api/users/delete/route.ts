import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, rateGuard, requireAuth, serviceError } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  confirm: z.literal("DELETE"),
});

/**
 * Hard account deletion. Requires the word DELETE typed exactly. Order is
 * FK-safe: everything that references the user goes first — their exam
 * artifacts, channel presence, school ownership (an owned school is wound
 * down with all its scoped rows), memberships, invites, inbox — then the
 * profile row and finally the auth user itself.
 */
export async function POST(req: Request) {
  const limited = rateGuard(req, "users-delete");
  if (limited) return limited;

  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;

  const admin = supabaseAdmin();
  const uid = auth.user.id;

  try {
    // 1. Exams authored by the user → their questions, sessions, answers, events.
    const mine = await admin.from("exams").select("id").eq("created_by", uid);
    const myExamIds = ((mine.data as { id: string }[]) ?? []).map((r) => r.id);
    if (myExamIds.length > 0) {
      const sess = await admin
        .from("exam_sessions")
        .select("id")
        .in("exam_id", myExamIds);
      const sessIds = ((sess.data as { id: string }[]) ?? []).map((r) => r.id);
      if (sessIds.length > 0) {
        await admin.from("answers").delete().in("session_id", sessIds);
        await admin.from("exam_events").delete().in("session_id", sessIds);
      }
      await admin.from("exam_events").delete().in("exam_id", myExamIds);
      await admin.from("exam_sessions").delete().in("exam_id", myExamIds);
      await admin.from("questions").delete().in("exam_id", myExamIds);
      await admin.from("exams").delete().in("id", myExamIds);
    }

    // 2. The user's own attempts in anyone else's exams.
    const theirSess = await admin.from("exam_sessions").select("id").eq("student_id", uid);
    const theirIds = ((theirSess.data as { id: string }[]) ?? []).map((r) => r.id);
    if (theirIds.length > 0) {
      await admin.from("answers").delete().in("session_id", theirIds);
      await admin.from("exam_events").delete().in("session_id", theirIds);
      await admin.from("exam_sessions").delete().eq("student_id", uid);
    }

    // 3. Channels: DMs/groups they created (with members + messages), their
    //    messages anywhere, their memberships.
    const chans = await admin.from("channels").select("id").eq("created_by", uid);
    const chanIds = ((chans.data as { id: string }[]) ?? []).map((r) => r.id);
    if (chanIds.length > 0) {
      await admin.from("messages").delete().in("channel_id", chanIds);
      await admin.from("channel_members").delete().in("channel_id", chanIds);
      await admin.from("channels").delete().in("id", chanIds);
    }
    await admin.from("messages").delete().eq("sender_id", uid);
    await admin.from("channel_members").delete().eq("user_id", uid);

    // 4. Schools they own → wind the school down entirely.
    const owned = await admin
      .from("school_members")
      .select("school_id")
      .eq("user_id", uid)
      .eq("role", "org_admin");
    const ownedIds = Array.from(
      new Set(((owned.data as { school_id: string }[]) ?? []).map((r) => r.school_id))
    );
    for (const schoolId of ownedIds) {
      const exams = await admin.from("exams").select("id").eq("school_id", schoolId);
      const examIds = ((exams.data as { id: string }[]) ?? []).map((r) => r.id);
      if (examIds.length > 0) {
        const ss = await admin.from("exam_sessions").select("id").in("exam_id", examIds);
        const ssIds = ((ss.data as { id: string }[]) ?? []).map((r) => r.id);
        if (ssIds.length > 0) {
          await admin.from("answers").delete().in("session_id", ssIds);
          await admin.from("exam_events").delete().in("session_id", ssIds);
        }
        await admin.from("exam_events").delete().in("exam_id", examIds);
        await admin.from("exam_sessions").delete().in("exam_id", examIds);
        await admin.from("questions").delete().in("exam_id", examIds);
        await admin.from("exams").delete().in("id", examIds);
      }
      await admin.from("teacher_permissions").delete().eq("school_id", schoolId);
      await admin.from("school_invites").delete().eq("school_id", schoolId);
      await admin.from("school_members").delete().eq("school_id", schoolId);
      await admin.from("classes").delete().eq("school_id", schoolId);
      await admin.from("schools").delete().eq("id", schoolId);
    }

    // 5. Memberships, invites they issued, inbox, subscription, profile.
    await admin.from("school_members").delete().eq("user_id", uid);
    await admin.from("school_invites").delete().eq("created_by", uid);
    await admin.from("inbox_messages").delete().eq("user_id", uid);
    await admin.from("teacher_permissions").delete().eq("teacher_id", uid);
    await admin.from("subscriptions").delete().eq("user_id", uid);
    await admin.from("profiles").delete().eq("id", uid);

    // 6. The auth user last — GoTrue hard delete.
    const del = await admin.auth.admin.deleteUser(uid);
    if (del.error) {
      console.error("[examforge:users-delete] deleteUser failed", del.error.message);
      return bad("Could not fully delete the account — contact support.", 500);
    }

    return ok({ ok: true, deleted: true });
  } catch (e) {
    return serviceError("users-delete", e);
  }
}
