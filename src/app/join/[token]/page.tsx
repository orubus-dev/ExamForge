import { supabaseAdmin } from "@/lib/supabase/admin";
import { getViewer } from "@/lib/session";
import JoinClient, { type JoinInfo } from "@/components/school/JoinClient";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/**
 * Public landing for a school's shareable invite link. Shows what you're
 * joining; signed-in visitors can join in one click, others are walked
 * through sign-in first (the link survives the detour via ?next=).
 */
export default async function JoinPage({ params }: { params: { token: string } }) {
  const token = params.token ?? "";
  let info: JoinInfo = {
    token,
    valid: false,
    reason: "That invite link is not valid.",
    schoolName: null,
    role: null,
    expiresAt: null,
  };

  if (/^[0-9a-f]{16,64}$/.test(token)) {
    const admin = supabaseAdmin();
    const inv = await admin
      .from("school_invites")
      .select("school_id,role,status,expires_at,username,email")
      .eq("token", token)
      .maybeSingle();
    const invite = inv.data as
      | {
          school_id: string;
          role: "student" | "teacher";
          status: string;
          expires_at: string;
          username: string | null;
          email: string | null;
        }
      | null;

    if (invite && !invite.username && !invite.email) {
      if (invite.status === "revoked" || invite.status === "declined") {
        info.reason = "This invite link was revoked by the school.";
      } else if (invite.status !== "pending") {
        info.reason = "This invite link is no longer active.";
      } else if (new Date(invite.expires_at).getTime() < Date.now()) {
        info.reason = "This invite link has expired — ask the school for a fresh one.";
      } else {
        const sch = await admin
          .from("schools")
          .select("name,short_code")
          .eq("id", invite.school_id)
          .maybeSingle();
        info = {
          token,
          valid: true,
          reason: null,
          schoolName: (sch.data?.name as string) ?? "A school on ExamForge",
          role: invite.role,
          expiresAt: invite.expires_at,
        };
      }
    }
  }

  const viewer = await getViewer();

  return (
    <JoinClient
      info={info}
      signedIn={!!viewer}
      who={viewer?.profile?.full_name || viewer?.user?.email || null}
    />
  );
}
