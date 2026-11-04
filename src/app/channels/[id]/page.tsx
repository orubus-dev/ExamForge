import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import ChannelRoomClient, { type RoomData } from "@/components/channels/ChannelRoomClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import type { Channel, ChannelMember, Message, Profile } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ChannelRoomPage({
  params,
}: {
  params: { id: string };
}) {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  const admin = supabaseAdmin();

  const chRes = await admin.from("channels").select("*").eq("id", params.id).maybeSingle();
  const channel = chRes.data as Channel | null;
  if (!channel) redirect("/channels");

  const memRes = await admin
    .from("channel_members")
    .select("*")
    .eq("channel_id", params.id);
  const members = (memRes.data as ChannelMember[]) ?? [];
  const isMember = members.some((m) => m.user_id === viewer.user.id);

  const msgRes = await admin
    .from("messages")
    .select("*")
    .eq("channel_id", params.id)
    .order("created_at", { ascending: true })
    .limit(200);
  const messages = (msgRes.data as Message[]) ?? [];

  const memberIds = members.map((m) => m.user_id);
  let names = new Map<string, string>();
  if (memberIds.length > 0) {
    const profRes = await admin
      .from("profiles")
      .select("id,full_name,username")
      .in("id", memberIds);
    names = new Map(
      ((profRes.data as Profile[]) ?? []).map((p) => [
        p.id,
        p.full_name || p.username || "member",
      ])
    );
  }

  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);
  const data: RoomData = {
    channel: {
      id: channel.id,
      title: channel.title,
      kind: channel.kind,
      key_wrapped: channel.key_wrapped,
    },
    myId: viewer.user.id,
    isMember,
    members: members.map((m) => ({
      user_id: m.user_id,
      role: m.role,
      name: names.get(m.user_id) ?? "member",
    })),
    messages: messages.map((m) => ({
      id: m.id,
      channel_id: m.channel_id,
      sender_id: m.sender_id,
      sender_name: names.get(m.sender_id) ?? "member",
      kind: m.kind,
      ciphertext: m.ciphertext,
      media_path: m.media_path,
      media_meta: m.media_meta ?? {},
      created_at: m.created_at,
    })),
  };

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role: role ?? "independent",
        schoolName: viewer.schools[0]?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
      contained={false}
    >
      <ChannelRoomClient data={data} />
    </AppShell>
  );
}
