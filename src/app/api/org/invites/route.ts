import { z } from "zod";
import { randomHex } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth, roleMember } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  school_id: z.string().uuid(),
  role: z.enum(["student", "teacher"]),
  target: z.string().trim().min(3).max(200), // username or email
  class_id: z.string().uuid().optional(),
});

/**
 * Invite someone into the school. The invite lands in their inbox (matched by
 * username or email) — they accept or decline from /inbox.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { school_id, role, target, class_id } = parsed.data;

  const member = roleMember(auth.memberships, ["org_admin"], school_id);
  if (!member) return bad("Only the school admin can send invites.", 403);

  const admin = supabaseAdmin();
  try {
    if (class_id) {
      const cls = await admin
        .from("classes")
        .select("id")
        .eq("id", class_id)
        .eq("school_id", school_id)
        .maybeSingle();
      if (!cls.data) return bad("That class does not belong to your school.", 400);
    }

    const isEmail = target.includes("@") && !target.includes(" ");
    const token = randomHex(16);
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    // Resolve an existing user so the invite can also drop into inbox_messages.
    let targetUserId: string | null = null;
    if (!isEmail) {
      const prof = await admin
        .from("profiles")
        .select("id")
        .ilike("username", target)
        .limit(1)
        .maybeSingle();
      targetUserId = prof.data?.id ?? null;
    } else {
      const prof = await admin
        .from("profiles")
        .select("id")
        .ilike("username", target)
        .limit(1)
        .maybeSingle();
      targetUserId = prof.data?.id ?? null;
    }

    const ins = await admin
      .from("school_invites")
      .insert({
        school_id,
        kind: role === "teacher" ? "teacher_invite" : "join_school",
        role,
        email: isEmail ? target.toLowerCase() : null,
        username: isEmail ? null : target,
        class_id: class_id ?? null,
        token,
        status: "pending",
        expires_at: expires,
        created_by: auth.user.id,
      })
      .select("id")
      .single();
    if (ins.error) return bad("Could not create the invite.", 400);

    if (targetUserId) {
      await admin.from("inbox_messages").insert({
        user_id: targetUserId,
        kind: "school_invite",
        title: "You're invited to join a school",
        body: `Accept or decline this ${role} invite from your inbox.`,
        payload: { invite_id: ins.data.id, school_id, role, class_id: class_id ?? null },
      });
    }

    return ok({ id: ins.data.id as string, token });
  } catch (e) {
    console.error("[examforge:org-invites]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
