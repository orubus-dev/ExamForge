import { z } from "zod";
import { randomHex } from "@/lib/crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth, roleMember, serviceError } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  school_id: z.string().uuid(),
  role: z.enum(["student", "teacher"]),
  class_id: z.string().uuid().optional(),
});

const RevokeBody = z.object({
  school_id: z.string().uuid(),
  id: z.string().uuid(),
});

/**
 * Shareable invite links. A link row lives in school_invites with no
 * username/email — "addressed to nobody" is exactly what makes it a link.
 * Anyone holding the URL can redeem it at /join/<token> while it is pending
 * and unexpired; the school can revoke it any time.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, CreateBody);
  if (!parsed.data) return parsed.res;
  const { school_id, role, class_id } = parsed.data;

  const member = roleMember(auth.memberships, ["org_admin"], school_id);
  if (!member) return bad("Only the school admin can create invite links.", 403);

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

    const token = randomHex(16);
    const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();

    const ins = await admin
      .from("school_invites")
      .insert({
        school_id,
        kind: role === "teacher" ? "teacher_invite" : "join_school",
        role,
        email: null,
        username: null,
        class_id: class_id ?? null,
        token,
        status: "pending",
        expires_at: expires,
        created_by: auth.user.id,
      })
      .select("id,expires_at")
      .single();
    if (ins.error) return bad("Could not create the invite link.", 400);

    const origin = new URL(req.url).origin;
    return ok({
      id: ins.data.id as string,
      token,
      url: `${origin}/join/${token}`,
      expires_at: ins.data.expires_at,
    });
  } catch (e) {
    return serviceError("org-invite-link", e);
  }
}

/** Revoke a link — it stops working immediately. */
export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, RevokeBody);
  if (!parsed.data) return parsed.res;
  const { school_id, id } = parsed.data;

  const member = roleMember(auth.memberships, ["org_admin"], school_id);
  if (!member) return bad("Only the school admin can revoke invite links.", 403);

  const admin = supabaseAdmin();
  try {
    const up = await admin
      .from("school_invites")
      .update({ status: "revoked" })
      .eq("id", id)
      .eq("school_id", school_id)
      .is("username", null)
      .is("email", null)
      .eq("status", "pending");
    if (up.error) return bad("Could not revoke that link.", 400);
    return ok({ ok: true });
  } catch (e) {
    return serviceError("org-invite-link-revoke", e);
  }
}
