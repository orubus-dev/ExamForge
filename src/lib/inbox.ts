import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";
import type { InboxMessage, SchoolInvite } from "./types";

export interface InboxData {
  invites: SchoolInvite[];
  messages: InboxMessage[];
}

const isFresh = (i: SchoolInvite) =>
  i.status === "pending" && new Date(i.expires_at).getTime() > Date.now();

/**
 * Inbox payload for a viewer:
 *  - school invites addressed by username (RLS-readable) or by email (service lookup)
 *  - system inbox messages (service lookup; tolerated if table is absent)
 */
export async function fetchInboxData(
  user: User,
  username: string | null | undefined
): Promise<InboxData> {
  const invites: SchoolInvite[] = [];
  const push = (rows: SchoolInvite[] | null) => {
    for (const row of rows ?? []) {
      if (!invites.some((i) => i.id === row.id)) invites.push(row);
    }
  };

  try {
    if (username) {
      const supabase = supabaseServer();
      const { data } = await supabase
        .from("school_invites")
        .select("*")
        .ilike("username", username)
        .limit(50);
      push((data as SchoolInvite[]) ?? null);
    }
  } catch {
    /* no-op */
  }

  let messages: InboxMessage[] = [];
  try {
    const admin = supabaseAdmin();
    if (user.email) {
      const { data } = await admin
        .from("school_invites")
        .select("*")
        .eq("email", user.email)
        .limit(50);
      push((data as SchoolInvite[]) ?? null);
    }
    const { data } = await admin
      .from("inbox_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    messages = (data as InboxMessage[]) ?? [];
  } catch {
    /* inbox_messages table may be absent in some environments */
  }

  return { invites: invites.filter(isFresh), messages };
}

export function unreadCount(data: InboxData): number {
  return data.invites.length + data.messages.filter((m) => !m.read_at).length;
}
