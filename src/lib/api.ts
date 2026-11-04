import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import type { User } from "@supabase/supabase-js";
import { supabaseServer } from "./supabase/server";
import { supabaseAdmin } from "./supabase/admin";
import { rateLimit, ipFrom } from "./rl";
import type { Profile, Role, SchoolMember } from "./types";

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function bad(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

/** Authenticated user for this request (via session cookies), or null. */
export async function currentUser(): Promise<User | null> {
  const supabase = supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

export interface Identity {
  profile: Profile | null;
  memberships: SchoolMember[];
}

export async function loadIdentity(userId: string): Promise<Identity> {
  const admin = supabaseAdmin();
  const [p, m] = await Promise.all([
    admin.from("profiles").select("*").eq("id", userId).maybeSingle(),
    admin.from("school_members").select("*").eq("user_id", userId),
  ]);
  return {
    profile: (p.data as Profile) ?? null,
    memberships: (m.data as SchoolMember[]) ?? [],
  };
}

export function membershipIn(
  memberships: SchoolMember[],
  schoolId: string
): SchoolMember | undefined {
  return memberships.find((m) => m.school_id === schoolId);
}

export function hasRole(m: SchoolMember | undefined, roles: Role[]): boolean {
  return !!m && roles.includes(m.role);
}

/** Wrap service-role failures — never leak internals to the client. */
export function serviceError(scope: string, e: unknown): NextResponse {
  console.error(`[examforge:${scope}]`, e);
  return bad("Something went wrong on our side. Please retry.", 500);
}

export function zodFail(e: ZodError): NextResponse {
  const first = e.issues[0];
  return bad(first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input", 422);
}

export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T; res: null } | { data: null; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { data: null, res: bad("Invalid JSON body", 400) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { data: null, res: zodFail(parsed.error) };
  return { data: parsed.data, res: null };
}

// ── Route guards ─────────────────────────────────────────────────────────────

export interface Authed {
  ok: true;
  user: User;
  profile: Profile | null;
  memberships: SchoolMember[];
}

export type AuthFail = { ok: false; res: NextResponse };

/** Require a signed-in user; loads profile + memberships. */
export async function requireAuth(): Promise<Authed | AuthFail> {
  const user = await currentUser();
  if (!user) return { ok: false, res: bad("Sign in required", 401) };
  const identity = await loadIdentity(user.id);
  return { ok: true, user, profile: identity.profile, memberships: identity.memberships };
}

/** First membership matching any of the roles (optionally scoped to a school). */
export function roleMember(
  memberships: SchoolMember[],
  roles: Role[],
  schoolId?: string
): SchoolMember | undefined {
  return memberships.find(
    (m) => roles.includes(m.role) && (!schoolId || m.school_id === schoolId)
  );
}

/** Sliding-window per-IP limiter for sensitive routes. Returns a 429 response when tripped. */
export function rateGuard(req: Request, scope: string): NextResponse | null {
  const r = rateLimit(`${scope}:${ipFrom(req)}`, 30, 60_000);
  if (r.ok) return null;
  return NextResponse.json(
    { error: "Too many attempts — try again shortly." },
    { status: 429, headers: { "retry-after": String(r.retryAfter) } }
  );
}
