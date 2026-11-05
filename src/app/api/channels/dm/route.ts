import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import type { ChannelMember } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  peer_id: z.string().uuid(),
  key_wrapped: z.string().min(10).max(2000),
});

/**
 * Open (or reuse) a direct-message channel with one person. The browser
 * generates the per-channel AES key and posts it wrapped, like group channels.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { peer_id, key_wrapped } = parsed.data;
  if (peer_id === auth.user.id) return bad("You already have notes to yourself.", 400);

  const admin = supabaseAdmin();

  const peerProfile = await admin
    .from("profiles")
    .select("id,username,full_name")
    .eq("id", peer_id)
    .maybeSingle();
  const peer = peerProfile.data as { id: string; username: string | null; full_name: string } | null;
  if (!peer) return bad("That person doesn't exist.", 404);

  try {
    // Reuse an existing DM between the two, if any.
    const mine = await admin
      .from("channel_members")
      .select("channel_id")
      .eq("user_id", auth.user.id);
    const myIds = ((mine.data as Pick<ChannelMember, "channel_id">[]) ?? []).map((m) => m.channel_id);

    if (myIds.length > 0) {
      const theirs = await admin
        .from("channel_members")
        .select("channel_id")
        .eq("user_id", peer_id)
        .in("channel_id", myIds);
      const shared = ((theirs.data as Pick<ChannelMember, "channel_id">[]) ?? []).map((m) => m.channel_id);
      if (shared.length > 0) {
        const rows = await admin
          .from("channels")
          .select("id")
          .in("id", shared)
          .eq("kind", "dm")
          .limit(1);
        const existing = (rows.data as { id: string }[] | null)?.[0];
        if (existing) return ok({ id: existing.id, reused: true });
      }
    }

    const title = peer.username || peer.full_name || "Direct message";
    const ins = await admin
      .from("channels")
      .insert({
        title,
        kind: "dm",
        key_wrapped,
        created_by: auth.user.id,
        school_id: null,
      })
      .select("id")
      .single();
    if (ins.error) return bad("Could not open the DM.", 400);

    await admin.from("channel_members").insert([
      { channel_id: ins.data.id as string, user_id: auth.user.id, role: "owner" },
      { channel_id: ins.data.id as string, user_id: peer_id, role: "member" },
    ]);

    return ok({ id: ins.data.id as string, reused: false });
  } catch (e) {
    console.error("[examforge:dm]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
