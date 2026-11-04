import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import { slugify } from "@/lib/utils";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(["school", "learning_center"]).default("school"),
  short_code: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Short code is 3 letters"),
});

/** Create a school; the creator becomes its org_admin. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;

  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { name, kind, short_code } = parsed.data;

  const admin = supabaseAdmin();
  try {
    const taken = await admin
      .from("schools")
      .select("id")
      .eq("short_code", short_code)
      .maybeSingle();
    if (taken.data) return bad("That 3-letter code is already taken — pick another.", 409);

    const ins = await admin
      .from("schools")
      .insert({
        name,
        kind,
        short_code,
        slug: `${slugify(name)}-${short_code.toLowerCase()}`,
        plan: "free",
        created_by: auth.user.id,
        branding: {},
      })
      .select("id")
      .single();
    if (ins.error) return bad(ins.error.message.includes("short_code") ? "That 3-letter code is already taken." : "Could not create the school.", 400);
    const schoolId = ins.data.id as string;

    const mem = await admin.from("school_members").insert({
      school_id: schoolId,
      user_id: auth.user.id,
      role: "org_admin",
      class_id: null,
    });
    if (mem.error) return bad("School created but membership failed — contact support.", 500);

    await admin
      .from("profiles")
      .update({ kind: "org_admin" })
      .eq("id", auth.user.id);

    return ok({ id: schoolId, short_code });
  } catch (e) {
    console.error("[examforge:org-school]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}

/** The creator's org_admin membership is what authorizes school ops elsewhere. */
export function GET() {
  return ok({ message: "Use POST to create a school." });
}
