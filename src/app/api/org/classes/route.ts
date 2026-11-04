import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth, roleMember } from "@/lib/api";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  school_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  short_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3}$/, "Short code is 3 characters"),
});

const PatchBody = z.object({
  class_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  short_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3}$/).optional(),
});

const DeleteBody = z.object({ class_id: z.string().uuid() });

/** org_admin only: create a class. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, CreateBody);
  if (!parsed.data) return parsed.res;
  const { school_id, name, short_code } = parsed.data;

  const member = roleMember(auth.memberships, ["org_admin"], school_id);
  if (!member) return bad("Only the school admin can manage classes.", 403);

  const admin = supabaseAdmin();
  try {
    const dup = await admin
      .from("classes")
      .select("id")
      .eq("school_id", school_id)
      .eq("short_code", short_code)
      .maybeSingle();
    if (dup.data) return bad("A class with that short code already exists.", 409);

    const ins = await admin
      .from("classes")
      .insert({ school_id, name, short_code, created_by: auth.user.id })
      .select("id")
      .single();
    if (ins.error) return bad("Could not create the class.", 400);
    return ok({ id: ins.data.id as string, short_code });
  } catch (e) {
    console.error("[examforge:org-classes]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}

/** org_admin only: rename a class or change its short code. */
export async function PATCH(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, PatchBody);
  if (!parsed.data) return parsed.res;
  const { class_id, name, short_code } = parsed.data;

  const cls = await supabaseAdmin()
    .from("classes")
    .select("school_id")
    .eq("id", class_id)
    .maybeSingle();
  if (!cls.data) return bad("Class not found.", 404);
  const member = roleMember(auth.memberships, ["org_admin"], cls.data.school_id as string);
  if (!member) return bad("Only the school admin can manage classes.", 403);

  const upd = await supabaseAdmin()
    .from("classes")
    .update({ ...(name ? { name } : {}), ...(short_code ? { short_code } : {}) })
    .eq("id", class_id);
  if (upd.error) return bad("Could not update the class.", 400);
  return ok({ ok: true });
}

/** org_admin only: delete a class; members keep their membership, class detached. */
export async function DELETE(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, DeleteBody);
  if (!parsed.data) return parsed.res;
  const { class_id } = parsed.data;

  const admin = supabaseAdmin();
  try {
    const cls = await admin.from("classes").select("school_id").eq("id", class_id).maybeSingle();
    if (!cls.data) return bad("Class not found.", 404);
    const member = roleMember(auth.memberships, ["org_admin"], cls.data.school_id as string);
    if (!member) return bad("Only the school admin can manage classes.", 403);

    await admin.from("school_members").update({ class_id: null }).eq("class_id", class_id);
    const del = await admin.from("classes").delete().eq("id", class_id);
    if (del.error) return bad("Could not delete the class.", 400);
    return ok({ ok: true });
  } catch (e) {
    console.error("[examforge:org-classes-delete]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
