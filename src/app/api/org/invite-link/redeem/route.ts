import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, rateGuard, requireAuth, serviceError } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  token: z.string().trim().regex(/^[0-9a-f]{16,64}$/, "That invite link is not valid."),
});

/**
 * Redeem a shareable invite link (/join/<token>). Only "link" invites — rows
 * with no username and no email — can be redeemed here; personal invites are
 * accepted from the inbox exclusively. Joining is idempotent: an existing
 * member just gets the school confirmed.
 */
export async function POST(req: Request) {
  const limited = rateGuard(req, "invite-link-redeem");
  if (limited) return limited;

  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { token } = parsed.data;

  const admin = supabaseAdmin();
  try {
    const inv = await admin
      .from("school_invites")
      .select("id,school_id,role,class_id,status,expires_at,username,email")
      .eq("token", token)
      .maybeSingle();
    const invite = inv.data as
      | {
          id: string;
          school_id: string;
          role: "student" | "teacher";
          class_id: string | null;
          status: string;
          expires_at: string;
          username: string | null;
          email: string | null;
        }
      | null;

    if (!invite || invite.username || invite.email) {
      return bad("That invite link is not valid.", 404);
    }
    if (invite.status === "revoked" || invite.status === "declined") {
      return bad("This invite link was revoked by the school.", 410);
    }
    if (invite.status !== "pending" || new Date(invite.expires_at).getTime() < Date.now()) {
      return bad("This invite link has expired — ask the school for a fresh one.", 410);
    }

    const already = await admin
      .from("school_members")
      .select("id")
      .eq("school_id", invite.school_id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (already.data) {
      await admin.from("profiles").update({ kind: invite.role }).eq("id", auth.user.id);
      return ok({ ok: true, status: "already_member", school_id: invite.school_id });
    }

    const ins = await admin.from("school_members").insert({
      school_id: invite.school_id,
      user_id: auth.user.id,
      role: invite.role,
      class_id: invite.class_id ?? null,
    });
    if (ins.error) return bad("Could not join the school.", 400);

    if (invite.role === "teacher") {
      await admin.from("teacher_permissions").upsert(
        {
          school_id: invite.school_id,
          teacher_id: auth.user.id,
          create_exams: true,
          publish_results: false,
          manage_question_bank: false,
          manage_classes: false,
          message_students: true,
          view_analytics: false,
          manage_students: false,
          proctor_exams: false,
        },
        { onConflict: "school_id,teacher_id" }
      );
    }

    await admin.from("profiles").update({ kind: invite.role }).eq("id", auth.user.id);

    return ok({ ok: true, status: "joined", school_id: invite.school_id, role: invite.role });
  } catch (e) {
    return serviceError("invite-link-redeem", e);
  }
}
