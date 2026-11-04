import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import type { InboxMessage, Profile, SchoolInvite } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  action: z.enum(["accept_invite", "decline_invite", "mark_read", "mark_all_read"]),
  invite_id: z.string().uuid().optional(),
  message_id: z.string().uuid().optional(),
});

/**
 * Inbox actions:
 *  - accept_invite → join the school (+class), write teacher permissions if provided
 *  - decline_invite → mark the invite declined
 *  - mark_read / mark_all_read → clear inbox_messages.read_at
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { action, invite_id, message_id } = parsed.data;

  const admin = supabaseAdmin();
  try {
    if (action === "mark_all_read") {
      await admin
        .from("inbox_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("user_id", auth.user.id)
        .is("read_at", null);
      return ok({ ok: true });
    }

    if (action === "mark_read") {
      if (!message_id) return bad("message_id is required.", 400);
      const m = await admin
        .from("inbox_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("id", message_id)
        .eq("user_id", auth.user.id);
      if (m.error) return bad("Could not mark as read.", 400);
      return ok({ ok: true });
    }

    if (!invite_id) return bad("invite_id is required.", 400);

    const inv = await admin
      .from("school_invites")
      .select("*")
      .eq("id", invite_id)
      .maybeSingle();
    const invite = inv.data as SchoolInvite | null;
    if (!invite) return bad("Invite not found.", 404);

    // The invite must actually be addressed to this user.
    const profileRes = await admin
      .from("profiles")
      .select("*")
      .eq("id", auth.user.id)
      .maybeSingle();
    const profile = profileRes.data as Profile | null;
    const addressedByUsername =
      !!invite.username &&
      !!profile?.username &&
      invite.username.toLowerCase() === profile.username.toLowerCase();
    const addressedByEmail =
      !!invite.email && !!auth.user.email && invite.email.toLowerCase() === auth.user.email.toLowerCase();
    if (!addressedByUsername && !addressedByEmail) {
      return bad("That invite is not addressed to you.", 403);
    }

    if (action === "decline_invite") {
      await admin
        .from("school_invites")
        .update({ status: "declined" })
        .eq("id", invite.id);
      return ok({ ok: true, status: "declined" });
    }

    // accept_invite
    if (invite.status !== "pending" || new Date(invite.expires_at).getTime() < Date.now()) {
      return bad("This invite is no longer valid.", 410);
    }
    const already = await admin
      .from("school_members")
      .select("id")
      .eq("school_id", invite.school_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (already.data) {
      await admin.from("school_invites").update({ status: "accepted" }).eq("id", invite.id);
      return ok({ ok: true, status: "already_member" });
    }

    const ins = await admin.from("school_members").insert({
      school_id: invite.school_id,
      user_id: auth.user.id,
      role: invite.role,
      class_id: invite.class_id ?? null,
    });
    if (ins.error) return bad("Could not join the school.", 400);

    // Teacher permissions recorded on the inbox message at invite time.
    if (invite.role === "teacher") {
      const msg = await admin
        .from("inbox_messages")
        .select("payload")
        .eq("payload->>invite_id", invite.id)
        .limit(1)
        .maybeSingle();
      const perms = (msg.data?.payload as { permissions?: Record<string, boolean> } | null)
        ?.permissions;
      const row: Record<string, unknown> = {
        school_id: invite.school_id,
        teacher_id: auth.user.id,
        create_exams: perms?.create_exams ?? true,
        publish_results: perms?.publish_results ?? false,
        manage_question_bank: perms?.manage_question_bank ?? false,
        manage_classes: perms?.manage_classes ?? false,
        message_students: perms?.message_students ?? true,
        view_analytics: perms?.view_analytics ?? false,
        manage_students: perms?.manage_students ?? false,
        proctor_exams: perms?.proctor_exams ?? false,
      };
      await admin
        .from("teacher_permissions")
        .upsert(row, { onConflict: "school_id,teacher_id" });
    }

    await admin
      .from("profiles")
      .update({ kind: invite.role })
      .eq("id", auth.user.id);
    await admin.from("school_invites").update({ status: "accepted" }).eq("id", invite.id);
    await admin
      .from("inbox_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("payload->>invite_id", invite.id)
      .eq("user_id", auth.user.id);

    return ok({ ok: true, status: "accepted", school_id: invite.school_id, class_id: invite.class_id });
  } catch (e) {
    console.error("[examforge:inbox-act]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
