import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bad, ok, parseBody, requireAuth } from "@/lib/api";
import type { ChannelMember } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().trim().min(1).max(80),
  kind: z.enum(["dm", "group", "class"]).default("group"),
  key_wrapped: z.string().min(10).max(2000),
  member_ids: z.array(z.string().uuid()).max(100).optional(),
});

/** List the channels I belong to. */
export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;

  const mem = await supabaseAdmin()
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", auth.user.id);
  const ids = ((mem.data as Pick<ChannelMember, "channel_id">[]) ?? []).map((m) => m.channel_id);
  if (ids.length === 0) return ok({ channels: [] });

  const rows = await supabaseAdmin()
    .from("channels")
    .select("*")
    .in("id", ids)
    .order("created_at", { ascending: false });
  return ok({ channels: rows.data ?? [] });
}

/**
 * Create an encrypted channel. The browser generates the per-channel AES key
 * and posts the (wrapped) key material — the server never sees plaintext keys.
 */
export async function POST(req: Request) {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;
  const parsed = await parseBody(req, Body);
  if (!parsed.data) return parsed.res;
  const { title, kind, key_wrapped, member_ids } = parsed.data;

  try {
    const admin = supabaseAdmin();
    const ins = await admin
      .from("channels")
      .insert({
        title,
        kind,
        key_wrapped,
        created_by: auth.user.id,
        school_id: null,
      })
      .select("id")
      .single();
    if (ins.error) return bad("Could not create the channel.", 400);

    const unique = Array.from(new Set([auth.user.id, ...(member_ids ?? [])]));
    await admin.from("channel_members").insert(
      unique.map((user_id) => ({
        channel_id: ins.data.id as string,
        user_id,
        role: user_id === auth.user.id ? "owner" : "member",
      }))
    );

    return ok({ id: ins.data.id });
  } catch (e) {
    console.error("[examforge:channels-create]", e);
    return bad("Something went wrong on our side. Please retry.", 500);
  }
}
