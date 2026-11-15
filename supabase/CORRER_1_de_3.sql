-- APEX — Parte 1 de 3. Córrelas en orden: 1, 2, 3.
-- Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Si algo falla no se aplica nada de esta parte; puedes reintentarla.

begin;

-- ================================================================
-- 005_reactions_and_deletes.sql
-- ================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- 005 · "Fuego" reactions on WOD results + missing delete policies
-- Run in Supabase Dashboard → SQL Editor. Idempotent: safe to run more than once.
-- The app hides the button until this table exists.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.wod_result_bumps (
  result_id  uuid not null references public.wod_results(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (result_id, user_id)
);

alter table public.wod_result_bumps enable row level security;

-- Visible to members of the box the WOD belongs to.
drop policy if exists "Box members see bumps" on public.wod_result_bumps;
create policy "Box members see bumps" on public.wod_result_bumps for select using (
  exists (
    select 1 from public.wod_results r
    join public.daily_wods d on d.id = r.daily_wod_id
    where r.id = wod_result_bumps.result_id and public.is_box_member(d.box_id)
  )
);

-- You can only bump as yourself, on results from your own box.
drop policy if exists "Members bump results in their box" on public.wod_result_bumps;
create policy "Members bump results in their box" on public.wod_result_bumps for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.wod_results r
    join public.daily_wods d on d.id = r.daily_wod_id
    where r.id = wod_result_bumps.result_id and public.is_box_member(d.box_id)
  )
);

drop policy if exists "Users remove own bumps" on public.wod_result_bumps;
create policy "Users remove own bumps" on public.wod_result_bumps for delete using (auth.uid() = user_id);

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'wod_result_bumps') then
    alter publication supabase_realtime add table public.wod_result_bumps;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Deletes that were missing from 001: a coach can delete a WOD of their box
-- (its results and bumps go with it via ON DELETE CASCADE), and an athlete can
-- delete their own result.
-- ═══════════════════════════════════════════════════════════════════════════════
drop policy if exists "Coach can delete wod" on public.daily_wods;
create policy "Coach can delete wod" on public.daily_wods for delete using (public.is_box_coach(box_id));

drop policy if exists "Athletes delete own results" on public.wod_results;
create policy "Athletes delete own results" on public.wod_results for delete using (auth.uid() = user_id);


-- ================================================================
-- 006_calendar_events.sql
-- ================================================================
-- 006_calendar_events.sql
-- Calendar: WODs programmed ahead + competitions/events with their workouts.
-- Run by hand in Supabase Dashboard → SQL Editor. Idempotent.

-- ─── WODs programmed ahead ─────────────────────────────────────────────────
-- The coach decides whether athletes see a future WOD before its day.
alter table public.daily_wods add column if not exists show_early boolean not null default false;

-- "Today" in the app's time zone (Vercel and Postgres run in UTC).
create or replace function public.app_today()
returns date language sql stable as $$
  select (now() at time zone 'America/Santiago')::date;
$$;

-- Athletes only see live WODs whose day has come, or that the coach revealed early.
-- Coaches see everything in their box (drafts, hidden, future).
drop policy if exists "Box members see daily wods" on public.daily_wods;
create policy "Box members see daily wods" on public.daily_wods for select using (
  public.is_box_coach(box_id)
  or (
    public.is_box_member(box_id)
    and is_live
    and (scheduled_for <= public.app_today() or show_early)
  )
);

-- Days that have a WOD programmed, without its content, so the calendar can show
-- "WOD programado" on days the coach keeps secret.
create or replace function public.box_wod_days(p_from date, p_to date)
returns table (box_id uuid, scheduled_for date)
language sql stable security definer set search_path = public as $$
  select distinct d.box_id, d.scheduled_for
  from public.daily_wods d
  where d.is_live
    and d.scheduled_for between p_from and p_to
    and public.is_box_member(d.box_id);
$$;
grant execute on function public.box_wod_days(date, date) to authenticated;

-- ─── Events (competitions, throwdowns, the Open…) ──────────────────────────
-- box_id null  → personal event, only its creator sees it.
-- box_id set   → box event, published by a coach, every member sees it.
create table if not exists public.events (
  id          uuid primary key default uuid_generate_v4(),
  box_id      uuid references public.boxes(id) on delete cascade,
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  kind        text not null default 'competencia'
              check (kind in ('competencia', 'open', 'throwdown', 'evento', 'otro')),
  starts_on   date not null,
  ends_on     date,
  location    text,
  url         text,
  notes       text,
  created_at  timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on)
);
create index if not exists idx_events_box_date on public.events(box_id, starts_on);
create index if not exists idx_events_creator on public.events(created_by, starts_on);

-- Each workout of the event. movements: [{ name, reps, load_lb, load_lb_f }]
-- load_lb is the men's prescription and load_lb_f the women's (both optional).
create table if not exists public.event_workouts (
  id             uuid primary key default uuid_generate_v4(),
  event_id       uuid not null references public.events(id) on delete cascade,
  position       integer not null default 0,
  title          text not null,
  type           text not null default 'fortime'
                 check (type in ('fortime', 'amrap', 'emom', 'tabata', 'strength')),
  time_cap_mins  integer,
  description    text not null default '',
  movements      jsonb not null default '[]',
  created_at     timestamptz not null default now()
);
create index if not exists idx_event_workouts_event on public.event_workouts(event_id, position);

-- Who is going, and in which category (m/f picks the prescribed load).
create table if not exists public.event_participants (
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  category    text not null default 'm' check (category in ('m', 'f')),
  division    text not null default 'rx' check (division in ('rx', 'scaled', 'masters', 'teens')),
  created_at  timestamptz not null default now(),
  primary key (event_id, user_id)
);

alter table public.events             enable row level security;
alter table public.event_workouts     enable row level security;
alter table public.event_participants enable row level security;

-- Can the current user edit this event? (creator, or a coach of its box)
create or replace function public.can_edit_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.created_by = auth.uid() or (e.box_id is not null and public.is_box_coach(e.box_id)))
  );
$$;

-- Can the current user see this event?
create or replace function public.can_see_event(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.events e
    where e.id = p_event_id
      and (e.created_by = auth.uid() or (e.box_id is not null and public.is_box_member(e.box_id)))
  );
$$;

-- events
drop policy if exists "See own and box events" on public.events;
create policy "See own and box events" on public.events for select using (
  created_by = auth.uid() or (box_id is not null and (public.is_box_member(box_id) or public.is_box_coach(box_id)))
);
drop policy if exists "Create own or box events" on public.events;
create policy "Create own or box events" on public.events for insert with check (
  created_by = auth.uid() and (box_id is null or public.is_box_coach(box_id))
);
drop policy if exists "Edit own or box events" on public.events;
create policy "Edit own or box events" on public.events for update using (
  created_by = auth.uid() or (box_id is not null and public.is_box_coach(box_id))
);
drop policy if exists "Delete own or box events" on public.events;
create policy "Delete own or box events" on public.events for delete using (
  created_by = auth.uid() or (box_id is not null and public.is_box_coach(box_id))
);

-- event_workouts
drop policy if exists "See workouts of visible events" on public.event_workouts;
create policy "See workouts of visible events" on public.event_workouts for select using (public.can_see_event(event_id));
drop policy if exists "Editors manage event workouts" on public.event_workouts;
create policy "Editors manage event workouts" on public.event_workouts for all
  using (public.can_edit_event(event_id)) with check (public.can_edit_event(event_id));

-- event_participants
drop policy if exists "See participants of visible events" on public.event_participants;
create policy "See participants of visible events" on public.event_participants for select using (public.can_see_event(event_id));
drop policy if exists "Join visible events" on public.event_participants;
create policy "Join visible events" on public.event_participants for insert with check (
  user_id = auth.uid() and public.can_see_event(event_id)
);
drop policy if exists "Update own participation" on public.event_participants;
create policy "Update own participation" on public.event_participants for update using (user_id = auth.uid());
drop policy if exists "Leave events" on public.event_participants;
create policy "Leave events" on public.event_participants for delete using (user_id = auth.uid());


-- ================================================================
-- 007_sessions_results_library.sql
-- ================================================================
-- 007_sessions_results_library.sql
-- Class times for WODs, competition results, athlete sex + dashboard layout,
-- box exercise library, personal training log and goals.
-- Run by hand in Supabase Dashboard → SQL Editor, after 006. Idempotent.

-- ─── Profile ───────────────────────────────────────────────────────────────
-- sex picks the men's/women's load in events automatically.
alter table public.profiles add column if not exists sex text check (sex in ('m', 'f'));
-- The athlete's home-screen layout: [{ id, visible, options }] (null = default layout).
alter table public.profiles add column if not exists dashboard_layout jsonb;

-- ─── WOD class times ───────────────────────────────────────────────────────
-- A box can publish several WODs on the same day, one per class (e.g. 07:00, 16:00, 22:00).
alter table public.daily_wods add column if not exists class_time time;
create index if not exists idx_daily_wods_box_day_time on public.daily_wods(box_id, scheduled_for, class_time);

-- ─── Competition results ───────────────────────────────────────────────────
create table if not exists public.event_results (
  workout_id    uuid not null references public.event_workouts(id) on delete cascade,
  event_id      uuid not null references public.events(id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  result_value  text not null,
  place         integer check (place is null or place > 0),
  notes         text,
  recorded_at   timestamptz not null default now(),
  primary key (workout_id, user_id)
);
create index if not exists idx_event_results_user on public.event_results(user_id, recorded_at desc);
alter table public.event_results enable row level security;

drop policy if exists "See results of visible events" on public.event_results;
create policy "See results of visible events" on public.event_results for select using (public.can_see_event(event_id));
drop policy if exists "Log own event results" on public.event_results;
create policy "Log own event results" on public.event_results for insert with check (user_id = auth.uid() and public.can_see_event(event_id));
drop policy if exists "Edit own event results" on public.event_results;
create policy "Edit own event results" on public.event_results for update using (user_id = auth.uid());
drop policy if exists "Delete own event results" on public.event_results;
create policy "Delete own event results" on public.event_results for delete using (user_id = auth.uid());

-- Final standing in the whole event.
alter table public.event_participants add column if not exists final_place integer check (final_place is null or final_place > 0);
alter table public.event_participants add column if not exists field_size integer check (field_size is null or field_size > 0);

-- ─── Exercise library ──────────────────────────────────────────────────────
-- box_id null = global movement (seeded). A coach can add movements for their box,
-- with how-to cues, an image and a video, so athletes see how each one is done.
alter table public.movements add column if not exists box_id uuid references public.boxes(id) on delete cascade;
alter table public.movements add column if not exists created_by uuid references public.profiles(id) on delete set null;
alter table public.movements add column if not exists image_url text;
alter table public.movements add column if not exists cues text;
alter table public.movements add column if not exists muscles text[];

drop policy if exists "Anyone can read movements" on public.movements;
create policy "Anyone can read movements" on public.movements for select using (
  box_id is null or public.is_box_member(box_id) or public.is_box_coach(box_id)
);
drop policy if exists "Coaches add box movements" on public.movements;
create policy "Coaches add box movements" on public.movements for insert with check (
  box_id is not null and public.is_box_coach(box_id) and created_by = auth.uid()
);
drop policy if exists "Coaches edit box movements" on public.movements;
create policy "Coaches edit box movements" on public.movements for update using (box_id is not null and public.is_box_coach(box_id));
drop policy if exists "Coaches delete box movements" on public.movements;
create policy "Coaches delete box movements" on public.movements for delete using (box_id is not null and public.is_box_coach(box_id));

-- ─── Training on your own ──────────────────────────────────────────────────
create table if not exists public.personal_logs (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  logged_on     date not null default public.app_today(),
  movement      text not null check (char_length(movement) between 1 and 80),
  sets          integer check (sets is null or sets > 0),
  reps          integer check (reps is null or reps > 0),
  load_lb       numeric check (load_lb is null or load_lb >= 0),
  duration_sec  integer check (duration_sec is null or duration_sec > 0),
  distance_m    integer check (distance_m is null or distance_m > 0),
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_personal_logs_user_day on public.personal_logs(user_id, logged_on desc);

create table if not exists public.goals (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  movement    text not null check (char_length(movement) between 1 and 80),
  target      integer not null check (target > 0),
  unit        text not null default 'reps' check (unit in ('reps', 'cal', 'm', 'min')),
  period      text not null default 'today' check (period in ('today', 'week', 'daily', 'weekly')),
  starts_on   date not null default public.app_today(),
  archived    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists idx_goals_user on public.goals(user_id, archived);

alter table public.personal_logs enable row level security;
alter table public.goals         enable row level security;

drop policy if exists "Own personal logs" on public.personal_logs;
create policy "Own personal logs" on public.personal_logs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Own goals" on public.goals;
create policy "Own goals" on public.goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ================================================================
-- 008_challenges_media.sql
-- ================================================================
-- 008_challenges_media.sql
-- Box challenges with a ranking, and photo uploads for exercises.
-- Run by hand in Supabase Dashboard → SQL Editor, after 007. Idempotent.

-- ─── Challenges ────────────────────────────────────────────────────────────
-- Any member of a box can create a challenge ("100 burpees esta semana");
-- the others join and log what they do. The ranking is the sum of entries.
create table if not exists public.challenges (
  id          uuid primary key default uuid_generate_v4(),
  box_id      uuid not null references public.boxes(id) on delete cascade,
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  movement    text not null check (char_length(movement) between 1 and 80),
  target      integer not null check (target > 0),
  unit        text not null default 'reps' check (unit in ('reps', 'cal', 'm', 'min')),
  starts_on   date not null default public.app_today(),
  ends_on     date not null,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists idx_challenges_box on public.challenges(box_id, ends_on desc);

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table if not exists public.challenge_entries (
  id            uuid primary key default uuid_generate_v4(),
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  amount        integer not null check (amount > 0),
  logged_on     date not null default public.app_today(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_challenge_entries on public.challenge_entries(challenge_id, user_id);

alter table public.challenges             enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_entries      enable row level security;

create or replace function public.can_see_challenge(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.challenges c
    where c.id = p_id and (public.is_box_member(c.box_id) or public.is_box_coach(c.box_id))
  );
$$;

drop policy if exists "Members see box challenges" on public.challenges;
create policy "Members see box challenges" on public.challenges for select using (public.is_box_member(box_id) or public.is_box_coach(box_id));
drop policy if exists "Members create challenges" on public.challenges;
create policy "Members create challenges" on public.challenges for insert with check (
  created_by = auth.uid() and (public.is_box_member(box_id) or public.is_box_coach(box_id))
);
drop policy if exists "Creator or coach edits challenge" on public.challenges;
create policy "Creator or coach edits challenge" on public.challenges for update using (created_by = auth.uid() or public.is_box_coach(box_id));
drop policy if exists "Creator or coach deletes challenge" on public.challenges;
create policy "Creator or coach deletes challenge" on public.challenges for delete using (created_by = auth.uid() or public.is_box_coach(box_id));

drop policy if exists "See challenge participants" on public.challenge_participants;
create policy "See challenge participants" on public.challenge_participants for select using (public.can_see_challenge(challenge_id));
drop policy if exists "Join challenges" on public.challenge_participants;
create policy "Join challenges" on public.challenge_participants for insert with check (user_id = auth.uid() and public.can_see_challenge(challenge_id));
drop policy if exists "Leave challenges" on public.challenge_participants;
create policy "Leave challenges" on public.challenge_participants for delete using (user_id = auth.uid());

drop policy if exists "See challenge entries" on public.challenge_entries;
create policy "See challenge entries" on public.challenge_entries for select using (public.can_see_challenge(challenge_id));
drop policy if exists "Log own challenge entries" on public.challenge_entries;
create policy "Log own challenge entries" on public.challenge_entries for insert with check (user_id = auth.uid() and public.can_see_challenge(challenge_id));
drop policy if exists "Delete own challenge entries" on public.challenge_entries;
create policy "Delete own challenge entries" on public.challenge_entries for delete using (user_id = auth.uid());

-- ─── Exercise photos ───────────────────────────────────────────────────────
-- Public bucket; files go under <box_id>/..., and only coaches of that box can upload.
insert into storage.buckets (id, name, public)
values ('movement-media', 'movement-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read movement media" on storage.objects;
create policy "Public read movement media" on storage.objects for select using (bucket_id = 'movement-media');
drop policy if exists "Coaches upload movement media" on storage.objects;
create policy "Coaches upload movement media" on storage.objects for insert to authenticated with check (
  bucket_id = 'movement-media' and public.is_box_coach(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "Coaches replace movement media" on storage.objects;
create policy "Coaches replace movement media" on storage.objects for update to authenticated using (
  bucket_id = 'movement-media' and public.is_box_coach(((storage.foldername(name))[1])::uuid)
);


-- ================================================================
-- 009_security_hardening.sql
-- ================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- 009 · Security hardening before launch
-- Safe to run more than once. Run after 001–008.
-- ═══════════════════════════════════════════════════════════════════════════════

-- 1. BOXES: the invite code was readable by anyone (even without an account), which let
--    anybody join any box. Now only the owner and the members of a box can read it.
--    Joining still works through join_box_by_code(), which checks the code on the server.
drop policy if exists "Public can read boxes" on public.boxes;
drop policy if exists "Members and owner can read box" on public.boxes;
create policy "Members and owner can read box" on public.boxes for select to authenticated
  using (owner_id = auth.uid() or public.is_box_member(id));

-- A box can only be created by its own owner (before, owner_id could be someone else).
drop policy if exists "Authenticated can create box" on public.boxes;
create policy "Authenticated can create box" on public.boxes for insert to authenticated
  with check (owner_id = auth.uid());

-- The owner can't hand the box to another account or change the plan from the app.
create or replace function public.guard_box_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.owner_id is distinct from old.owner_id then raise exception 'No puedes cambiar el dueño del box'; end if;
    if new.plan is distinct from old.plan then raise exception 'No puedes cambiar el plan'; end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_box_fields on public.boxes;
create trigger trg_guard_box_fields before update on public.boxes
  for each row execute function public.guard_box_fields();

-- 2. PROFILES: visitors without an account could read the email of any public profile.
--    They now get only the columns the public page shows.
revoke select on public.profiles from anon;
grant select (id, full_name, avatar_url, role, preferred_unit, bio, city, favorite_movement,
              profile_public, show_prs_public, tracking_since, created_at)
  on public.profiles to anon;

-- Nobody edits another person's profile, and the id/email of a profile never change from the app.
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles for update
  using (auth.uid() = id) with check (auth.uid() = id);

create or replace function public.guard_profile_identity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.id is distinct from old.id or new.email is distinct from old.email) then
    raise exception 'No puedes cambiar ese dato';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_profile_identity on public.profiles;
create trigger trg_guard_profile_identity before update on public.profiles
  for each row execute function public.guard_profile_identity();

-- 3. Updates must keep the row in the hands of whoever owned it (no moving a record to another user).
drop policy if exists "Own PRs updatable" on public.pr_records;
create policy "Own PRs updatable" on public.pr_records for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Athletes update own results" on public.wod_results;
create policy "Athletes update own results" on public.wod_results for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Update own benchmarks" on public.benchmarks;
create policy "Update own benchmarks" on public.benchmarks for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Coach can update wod" on public.daily_wods;
create policy "Coach can update wod" on public.daily_wods for update
  using (public.is_box_coach(box_id)) with check (public.is_box_coach(box_id));

-- 4. UPLOADS: photos only (JPEG, PNG, WebP), 5 MB at most, enforced by the storage server.
update storage.buckets
   set file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id in ('avatars', 'box-logos', 'movement-media');

-- 5. INPUT LIMITS: nobody can store absurdly long texts, whatever the app sends.
--    Added only for columns that exist, and not checked against old rows (NOT VALID).
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('profiles', 'full_name', 80), ('profiles', 'bio', 500), ('profiles', 'city', 80),
      ('profiles', 'favorite_movement', 80), ('profiles', 'avatar_url', 500),
      ('boxes', 'name', 80), ('boxes', 'city', 80), ('boxes', 'country', 80), ('boxes', 'logo_url', 500),
      ('daily_wods', 'title', 120), ('daily_wods', 'description', 5000), ('daily_wods', 'coach_notes', 2000),
      ('wod_templates', 'title', 120), ('wod_templates', 'description', 5000),
      ('wod_results', 'notes', 1000), ('pr_records', 'notes', 1000), ('benchmarks', 'notes', 1000),
      ('movements', 'name', 80), ('movements', 'cues', 2000), ('movements', 'image_url', 500), ('movements', 'video_url', 500),
      ('events', 'title', 120), ('events', 'location', 160), ('events', 'description', 5000), ('events', 'url', 500),
      ('event_workouts', 'title', 120), ('event_workouts', 'description', 5000),
      ('event_results', 'notes', 1000),
      ('challenges', 'title', 80), ('challenges', 'movement', 80),
      ('personal_logs', 'title', 120), ('personal_logs', 'notes', 2000),
      ('goals', 'title', 120)
    ) as t(tbl, col, max_len)
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = r.tbl and column_name = r.col
                  and data_type in ('text', 'character varying'))
       and not exists (select 1 from pg_constraint where conname = format('%s_%s_len', r.tbl, r.col)) then
      execute format('alter table public.%I add constraint %I check (char_length(%I) <= %s) not valid',
                     r.tbl, format('%s_%s_len', r.tbl, r.col), r.col, r.max_len);
    end if;
  end loop;
end $$;

-- 6. Internal helper that rewrites PR flags: only the database triggers call it, never the app.
revoke all on function public.recalc_pr_for(uuid, uuid, text) from public, anon, authenticated;


commit;
