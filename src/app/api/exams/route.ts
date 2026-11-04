import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth, roleMember } from "@/lib/api";
import { TIER_LIMITS } from "@/lib/plans";
import { effectiveTier } from "@/lib/tiers";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const CreateBody = z.object({
  title: z.string().trim().min(2).max(200),
  subject: z.string().trim().max(120).optional().default(""),
  class_id: z.string().uuid().optional(),
  instructions: z.string().max(4000).optional().default(""),
});

/** List my exams (teacher / org_admin). */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const member = roleMember(auth.memberships, ["teacher", "org_admin"]);
  if (!member) return bad("Teacher or admin access required.", 403);

  const rows = await supabaseAdmin()
    .from("exams")
    .select("id,title,subject,status,invite_code,settings,created_at")
    .eq("created_by", auth.user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return ok({ exams: rows.data ?? [] });
}

/** Create a draft exam with server-side tier limit enforcement. */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, CreateBody);
  if (!parsed.data) return parsed.res;
  const { title, subject, class_id, instructions } = parsed.data;

  const member = roleMember(auth.memberships, ["teacher", "org_admin"]);
  if (!member) return bad("Join a school as a teacher (or create one) to run exams.", 403);

  const admin = supabaseAdmin();
  try {
    // Tier limit — counted over my active (draft/ready/live) exams.
    const active = await admin
      .from("exams")
      .select("id")
      .eq("created_by", auth.user.id)
      .in("status", ["draft", "ready", "live"]);
    const activeCount = active.data?.length ?? 0;

    let schoolPlan: string | null = null;
    if (member.school_id) {
      const s = await admin.from("schools").select("plan").eq("id", member.school_id).maybeSingle();
      schoolPlan = s.data?.plan ?? null;
    }
    const tier = await effectiveTier(auth.user.id, schoolPlan);
    const limit = TIER_LIMITS[tier].activeExams;
    if (activeCount >= limit) {
      return bad(
        `Your ${TIER_LIMITS[tier].label} plan allows ${limit} active exam${limit === 1 ? "" : "s"}. Close or archive one, or upgrade on the Plans page.`,
        402
      );
    }

    if (class_id) {
      const cls = await admin
        .from("classes")
        .select("id")
        .eq("id", class_id)
        .eq("school_id", member.school_id)
        .maybeSingle();
      if (!cls.data) return bad("That class does not belong to your school.", 400);
    }

    if (member.role === "teacher") {
      const teacherPerms = await admin
        .from("teacher_permissions")
        .select("create_exams")
        .eq("school_id", member.school_id)
        .eq("teacher_id", auth.user.id)
        .maybeSingle();
      if (teacherPerms.data?.create_exams === false) {
        return bad("Your school has disabled exam creation for your account.", 403);
      }
    }

    const ins = await admin
      .from("exams")
      .insert({
        school_id: member.school_id,
        class_id: class_id ?? null,
        title,
        subject,
        instructions,
        created_by: auth.user.id,
        status: "draft",
        settings: {},
      })
      .select("id,invite_code")
      .single();
    if (ins.error) return bad("Could not create the exam.", 400);
    return ok({
      id: ins.data.id,
      invite_code: ins.data.invite_code,
      tier,
      activeCount: activeCount + 1,
    });
  } catch (e) {
    console.error("[examforge:exams-create]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
