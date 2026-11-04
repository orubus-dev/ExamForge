import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import ChannelsClient, { type ChannelsData } from "@/components/channels/ChannelsClient";
import { getViewer, primaryRole } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { fetchInboxData, unreadCount } from "@/lib/inbox";
import type { Channel, ChannelMember } from "@/lib/types";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/auth");
  const role = primaryRole(viewer);
  const admin = supabaseAdmin();

  const memRes = await admin
    .from("channel_members")
    .select("channel_id")
    .eq("user_id", viewer.user.id);
  const ids = ((memRes.data as Pick<ChannelMember, "channel_id">[]) ?? []).map((m) => m.channel_id);

  let channels: (Channel & { members: number })[] = [];
  if (ids.length > 0) {
    const chRes = await admin
      .from("channels")
      .select("*")
      .in("id", ids)
      .order("created_at", { ascending: false });
    const raw = (chRes.data as Channel[]) ?? [];
    const memAll = await admin
      .from("channel_members")
      .select("channel_id,user_id")
      .in("channel_id", ids);
    const memRows = (memAll.data as Pick<ChannelMember, "channel_id" | "user_id">[]) ?? [];
    channels = raw.map((c) => ({
      ...c,
      members: memRows.filter((m) => m.channel_id === c.id).length,
    }));
  }

  const inbox = await fetchInboxData(viewer.user, viewer.profile?.username);
  const data: ChannelsData = { channels, myId: viewer.user.id };

  return (
    <AppShell
      viewer={{
        name: viewer.profile?.full_name || viewer.user.email || "you",
        role: role ?? "independent",
        schoolName: viewer.schools[0]?.name ?? null,
        unread: unreadCount(inbox),
        studentTag: viewer.profile?.student_tag ?? null,
      }}
    >
      <ChannelsClient data={data} viewerName={viewer.profile?.full_name ?? ""} />
    </AppShell>
  );
}
