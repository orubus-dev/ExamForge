-- ═══════════════════════════════════════════════════════════════════════════
-- RLS recursion fix — 42P17 "infinite recursion detected in policy"
--
-- Root causes fixed:
--   1. school_members SELECT/ALL policies sub-queried school_members itself.
--   2. channel_members SELECT/INSERT policies sub-queried channel_members itself.
--   3. Every school-scoped policy (profiles, classes, exams, questions, ...)
--      sub-queried school_members → all authenticated reads 42P17'd.
--   4. "schools: members read" compared m.school_id = m.id (typo, always false).
--
-- Fix pattern: SECURITY DEFINER helper functions (owner: postgres, tables are
-- NOT force-RLS) encapsulate membership checks; policies call helpers instead
-- of re-querying protected tables. Semantics preserved, recursion impossible.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.ef_is_school_member(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_members sm
    where sm.user_id = auth.uid() and sm.school_id = _school
  );
$$;

create or replace function public.ef_has_school_role(_school uuid, _roles text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.school_members sm
    where sm.user_id = auth.uid() and sm.school_id = _school and sm.role = any(_roles)
  );
$$;

create or replace function public.ef_shares_school(_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.school_members a
    join public.school_members b on b.school_id = a.school_id
    where a.user_id = auth.uid() and b.user_id = _user
  );
$$;

create or replace function public.ef_is_channel_member(_channel uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.channel_members cm
    where cm.user_id = auth.uid() and cm.channel_id = _channel
  );
$$;

create or replace function public.ef_exam_staff(_exam uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.exams e
    join public.school_members sm on sm.school_id = e.school_id
    where e.id = _exam and sm.user_id = auth.uid()
      and sm.role = any (array['org_admin', 'teacher'])
  );
$$;

create or replace function public.ef_exam_grader(_exam uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.exams e
    join public.school_members sm on sm.school_id = e.school_id
    where e.id = _exam and sm.user_id = auth.uid()
      and (sm.role = 'org_admin' or (sm.role = 'teacher' and e.created_by = auth.uid()))
  );
$$;

create or replace function public.ef_is_exam_creator(_exam uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exams e where e.id = _exam and e.created_by = auth.uid()
  );
$$;

create or replace function public.ef_teacher_can_create_exams(_school uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.school_members m
    left join public.teacher_permissions tp
      on tp.school_id = m.school_id and tp.teacher_id = m.user_id
    where m.user_id = auth.uid() and m.school_id = _school and m.role = 'teacher'
      and coalesce(tp.create_exams, true)
  );
$$;

revoke all on function public.ef_is_school_member(uuid) from anon, authenticated;
revoke all on function public.ef_has_school_role(uuid, text[]) from anon, authenticated;
revoke all on function public.ef_shares_school(uuid) from anon, authenticated;
revoke all on function public.ef_is_channel_member(uuid) from anon, authenticated;
revoke all on function public.ef_exam_staff(uuid) from anon, authenticated;
revoke all on function public.ef_exam_grader(uuid) from anon, authenticated;
revoke all on function public.ef_is_exam_creator(uuid) from anon, authenticated;
revoke all on function public.ef_teacher_can_create_exams(uuid) from anon, authenticated;
grant execute on function public.ef_is_school_member(uuid) to authenticated;
grant execute on function public.ef_has_school_role(uuid, text[]) to authenticated;
grant execute on function public.ef_shares_school(uuid) to authenticated;
grant execute on function public.ef_is_channel_member(uuid) to authenticated;
grant execute on function public.ef_exam_staff(uuid) to authenticated;
grant execute on function public.ef_exam_grader(uuid) to authenticated;
grant execute on function public.ef_is_exam_creator(uuid) to authenticated;
grant execute on function public.ef_teacher_can_create_exams(uuid) to authenticated;

-- ── school_members (self-referencing policies) ─────────────────────────────
drop policy if exists "members: read same-school" on public.school_members;
create policy "members: read same-school" on public.school_members
  for select using (public.ef_is_school_member(school_id));

drop policy if exists "members: org_admin manages" on public.school_members;
create policy "members: org_admin manages" on public.school_members
  for all
  using (public.ef_has_school_role(school_id, array['org_admin']::text[]))
  with check (public.ef_has_school_role(school_id, array['org_admin']::text[]));

-- ── channel_members (self-referencing policies) ────────────────────────────
drop policy if exists "cm: members read" on public.channel_members;
create policy "cm: members read" on public.channel_members
  for select using (public.ef_is_channel_member(channel_id));

drop policy if exists "cm: members add" on public.channel_members
  ;
create policy "cm: members add" on public.channel_members
  for insert with check (public.ef_is_channel_member(channel_id));

-- ── profiles ───────────────────────────────────────────────────────────────
drop policy if exists "profiles: read school-mates" on public.profiles;
create policy "profiles: read school-mates" on public.profiles
  for select using (public.ef_shares_school(id));

-- ── schools (typo fix + helper) ────────────────────────────────────────────
drop policy if exists "schools: members read" on public.schools;
create policy "schools: members read" on public.schools
  for select using (public.ef_is_school_member(id));

-- ── classes ────────────────────────────────────────────────────────────────
drop policy if exists "classes: org_admin manages" on public.classes;
create policy "classes: org_admin manages" on public.classes
  for all
  using (public.ef_has_school_role(classes.school_id, array['org_admin']::text[]))
  with check (public.ef_has_school_role(classes.school_id, array['org_admin']::text[]));

drop policy if exists "classes: school members read" on public.classes;
create policy "classes: school members read" on public.classes
  for select using (public.ef_is_school_member(classes.school_id));

-- ── exams ──────────────────────────────────────────────────────────────────
drop policy if exists "exams: staff read school exams" on public.exams;
create policy "exams: staff read school exams" on public.exams
  for select using (public.ef_has_school_role(exams.school_id, array['org_admin','teacher']::text[]));

drop policy if exists "exams: students read live/closed" on public.exams;
create policy "exams: students read live/closed" on public.exams
  for select using (
    status = any (array['live','closed','graded'])
    and public.ef_has_school_role(exams.school_id, array['student']::text[])
    and (
      class_id is null
      or exists (
        select 1 from public.school_members m
        where m.user_id = auth.uid() and m.school_id = exams.school_id
          and (m.class_id = exams.class_id or m.class_id is null)
      )
    )
  );

drop policy if exists "exams: creator updates" on public.exams;
create policy "exams: creator updates" on public.exams
  for update
  using (
    created_by = auth.uid()
    or public.ef_has_school_role(exams.school_id, array['org_admin']::text[])
  )
  with check (
    created_by = auth.uid()
    or public.ef_has_school_role(exams.school_id, array['org_admin']::text[])
  );

drop policy if exists "exams: creator deletes" on public.exams;
create policy "exams: creator deletes" on public.exams
  for delete using (
    created_by = auth.uid()
    or public.ef_has_school_role(exams.school_id, array['org_admin']::text[])
  );

drop policy if exists "exams: teachers create per permission" on public.exams;
create policy "exams: teachers create per permission" on public.exams
  for insert with check (
    created_by = auth.uid()
    and (
      public.ef_has_school_role(exams.school_id, array['org_admin']::text[])
      or public.ef_teacher_can_create_exams(exams.school_id)
    )
  );

-- ── questions ──────────────────────────────────────────────────────────────
drop policy if exists "questions: staff full via exam school" on public.questions;
create policy "questions: staff full via exam school" on public.questions
  for all
  using (
    public.ef_exam_staff(questions.exam_id)
    or public.ef_is_exam_creator(questions.exam_id)
  )
  with check (
    public.ef_exam_staff(questions.exam_id)
    or public.ef_is_exam_creator(questions.exam_id)
  );

drop policy if exists "questions: students read during live/graded" on public.questions;
create policy "questions: students read during live/graded" on public.questions
  for select using (
    exists (
      select 1 from public.exams e
      where e.id = questions.exam_id
        and e.status = any (array['live','closed','graded'])
        and public.ef_has_school_role(e.school_id, array['student']::text[])
    )
  );

-- ── exam_sessions ──────────────────────────────────────────────────────────
drop policy if exists "sessions: staff read" on public.exam_sessions;
create policy "sessions: staff read" on public.exam_sessions
  for select using (public.ef_exam_staff(exam_sessions.exam_id));

drop policy if exists "sessions: staff grade" on public.exam_sessions;
create policy "sessions: staff grade" on public.exam_sessions
  for update
  using (public.ef_exam_grader(exam_sessions.exam_id))
  with check (true);

-- ── exam_events ────────────────────────────────────────────────────────────
drop policy if exists "events: staff read" on public.exam_events;
create policy "events: staff read" on public.exam_events
  for select using (public.ef_exam_staff(exam_events.exam_id));

-- ── answers ────────────────────────────────────────────────────────────────
drop policy if exists "answers: staff read" on public.answers;
create policy "answers: staff read" on public.answers
  for select using (
    exists (
      select 1 from public.exam_sessions s
      where s.id = answers.session_id and public.ef_exam_staff(s.exam_id)
    )
  );

-- ── messages (channel_members subquery) ─────────────────────────────────────
drop policy if exists "messages: members read" on public.messages;
create policy "messages: members read" on public.messages
  for select using (public.ef_is_channel_member(messages.channel_id));

drop policy if exists "messages: members send" on public.messages;
create policy "messages: members send" on public.messages
  for insert with check (
    sender_id = auth.uid() and public.ef_is_channel_member(messages.channel_id)
  );

-- ── channels (members read unchanged logic) ────────────────────────────────
drop policy if exists "channels: members read" on public.channels;
create policy "channels: members read" on public.channels
  for select using (public.ef_is_channel_member(channels.id));

-- ── teacher_permissions ────────────────────────────────────────────────────
drop policy if exists "tp: org_admin manages" on public.teacher_permissions;
create policy "tp: org_admin manages" on public.teacher_permissions
  for all
  using (public.ef_has_school_role(teacher_permissions.school_id, array['org_admin']::text[]))
  with check (public.ef_has_school_role(teacher_permissions.school_id, array['org_admin']::text[]));

drop policy if exists "tp: school members read" on public.teacher_permissions;
create policy "tp: school members read" on public.teacher_permissions
  for select using (public.ef_is_school_member(teacher_permissions.school_id));

-- ── school_invites ─────────────────────────────────────────────────────────
drop policy if exists "invites: org_admin manages" on public.school_invites;
create policy "invites: org_admin manages" on public.school_invites
  for all
  using (public.ef_has_school_role(school_invites.school_id, array['org_admin']::text[]))
  with check (public.ef_has_school_role(school_invites.school_id, array['org_admin']::text[]));

-- ── subscriptions ──────────────────────────────────────────────────────────
drop policy if exists "subs: owner + school admins read" on public.subscriptions;
create policy "subs: owner + school admins read" on public.subscriptions
  for select using (
    owner_id = auth.uid()
    or public.ef_has_school_role(subscriptions.school_id, array['org_admin']::text[])
  );
