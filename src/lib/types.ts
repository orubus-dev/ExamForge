// ── Identity ─────────────────────────────────────────────────────────────────
export type Role = "org_admin" | "teacher" | "student";
export type ProfileKind = "student" | "teacher" | "org_admin";
export type Provider = "email" | "genjutsu" | "relay" | "school";

export interface Profile {
  id: string;
  username: string | null;
  full_name: string;
  kind: ProfileKind;
  provider: Provider;
  genjutsu_sub: string | null;
  relay_external_id: string | null;
  student_tag: string | null;
  created_at: string;
  updated_at: string;
}

// ── Schools ──────────────────────────────────────────────────────────────────
export interface School {
  id: string;
  name: string;
  short_code: string;
  slug: string;
  kind: "school" | "learning_center";
  plan: "free" | "plus" | "pro" | "enterprise";
  branding: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface SchoolMember {
  id: string;
  school_id: string;
  user_id: string;
  role: Role;
  class_id: string | null;
  joined_at: string;
}

export interface ClassRow {
  id: string;
  school_id: string;
  name: string;
  short_code: string;
  grade_level: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TeacherPermissions {
  school_id: string;
  teacher_id: string;
  create_exams: boolean;
  publish_results: boolean;
  manage_question_bank: boolean;
  manage_classes: boolean;
  message_students: boolean;
  view_analytics: boolean;
  manage_students: boolean;
  proctor_exams: boolean;
}

export interface SchoolInvite {
  id: string;
  school_id: string;
  kind: "join_school" | "teacher_invite";
  role: "student" | "teacher";
  email: string | null;
  username: string | null;
  class_id: string | null;
  token: string;
  status: "pending" | "accepted" | "declined" | "revoked" | "expired";
  expires_at: string;
  created_by: string | null;
  created_at: string;
}

export interface InboxMessage {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

// ── Exams ────────────────────────────────────────────────────────────────────
export type ExamStatus = "draft" | "ready" | "live" | "closed" | "graded";

export interface ExamSettings {
  duration_minutes?: number | null;
  start_window_end?: string | null;
  shuffle_questions?: boolean;
  shuffle_options?: boolean;
  one_attempt?: boolean;
  fullscreen_enforce?: boolean;
  tab_blur_log?: boolean;
  reveal_results?: boolean;
  per_question_seconds?: number | null;
}

export interface Exam {
  id: string;
  school_id: string | null;
  class_id: string | null;
  title: string;
  subject: string;
  instructions: string;
  created_by: string;
  status: ExamStatus;
  invite_code: string;
  pin_hash: string;
  settings: ExamSettings;
  created_at: string;
  updated_at: string;
}

export type QuestionType = "mcq" | "multi" | "truefalse" | "short";
export type QuestionOption = { key: string; text: string };

export interface Question {
  id: string;
  exam_id: string;
  ord: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  correct: string[];
  points: number;
  explanation: string;
  image_path: string | null;
  created_at: string;
}

export interface QuestionDraft {
  id: string;
  ord: number;
  type: QuestionType;
  prompt: string;
  options: QuestionOption[];
  correct: string[];
  points: number;
  explanation: string;
}

// ── Sessions & answers ───────────────────────────────────────────────────────
export type SessionStatus =
  | "joined_waiting"
  | "in_progress"
  | "submitted"
  | "graded"
  | "abandoned";

export interface ExamSession {
  id: string;
  exam_id: string;
  student_id: string;
  status: SessionStatus;
  started_at: string | null;
  deadline_at: string | null;
  submitted_at: string | null;
  score: number;
  total_points: number;
  tab_blurs: number;
  attempt: number;
  last_seen_at: string;
  created_at: string;
}

export interface Answer {
  id: string;
  session_id: string;
  question_id: string;
  response: unknown;
  correct: boolean | null;
  points_awarded: number;
  updated_at: string;
}

export interface ExamEvent {
  id: number;
  exam_id: string;
  session_id: string | null;
  kind: string;
  payload: Record<string, unknown>;
  at: string;
}

// ── Channels ─────────────────────────────────────────────────────────────────
export interface Channel {
  id: string;
  school_id: string | null;
  kind: "dm" | "group" | "class";
  title: string;
  key_wrapped: string;
  created_by: string;
  created_at: string;
}

export interface ChannelMember {
  channel_id: string;
  user_id: string;
  role: "owner" | "member";
  joined_at: string;
}

export interface Message {
  id: string;
  channel_id: string;
  sender_id: string;
  kind: "text" | "file" | "image" | "voice" | "system";
  ciphertext: string;
  media_path: string | null;
  media_meta: { iv?: string; name?: string; type?: string; size?: number } & Record<
    string,
    unknown
  >;
  created_at: string;
}

// ── Billing ──────────────────────────────────────────────────────────────────
export type Tier = "free" | "plus" | "pro" | "enterprise";
export type StatusBadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export interface Subscription {
  id: string;
  school_id: string | null;
  owner_id: string;
  tier: Tier | "pending_provider";
  status: "pending_provider" | "active" | "past_due" | "canceled";
  limits: Record<string, unknown>;
  renews_at: string | null;
  created_at: string;
}
