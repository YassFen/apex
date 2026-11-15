-- APEX: todo lo que falta correr en Supabase (migraciones 005 a 013), en orden.
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Va dentro de una transacción: si algo falla, no se aplica nada y puedes reintentar.
-- Al final hay un paso para darte acceso al panel de administrador de la app: cambia el correo.

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


-- ================================================================
-- 010_box_admin.sql
-- ================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- 010 · Box administrator: plans, memberships, class grid, bookings, coach
--       replacements and announcements.
-- Safe to run more than once. Run after 001–009.
-- ═══════════════════════════════════════════════════════════════════════════════

-- The box administrator is the owner of the box, or a member with role 'admin'.
create or replace function public.is_box_admin(p_box_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.boxes where id = p_box_id and owner_id = auth.uid())
      or exists(select 1 from public.box_members
                where box_id = p_box_id and user_id = auth.uid() and role = 'admin' and is_active);
$$;

alter table public.box_members add column if not exists left_at timestamptz;
alter table public.profiles    add column if not exists birth_year smallint
  check (birth_year is null or birth_year between 1920 and 2025);

-- The administrator sees former members too (the roster policy only shows active boxes of yours).
drop policy if exists "Admin sees whole roster" on public.box_members;
create policy "Admin sees whole roster" on public.box_members for select to authenticated
  using (public.is_box_admin(box_id));
drop policy if exists "Admin sees member profiles" on public.profiles;
create policy "Admin sees member profiles" on public.profiles for select to authenticated
  using (exists (select 1 from public.box_members bm where bm.user_id = profiles.id and public.is_box_admin(bm.box_id)));

-- Only the administrator changes roles or deactivates people (before, any coach could).
drop policy if exists "Coach can manage members" on public.box_members;
drop policy if exists "Admin can manage members" on public.box_members;
create policy "Admin can manage members" on public.box_members for update to authenticated
  using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));

-- Promote or demote a member. Making someone coach also lets their account use coach mode.
create or replace function public.set_member_role(p_box uuid, p_user uuid, p_role text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_box_admin(p_box) then raise exception 'not_allowed'; end if;
  if p_role not in ('athlete', 'coach', 'admin') then raise exception 'bad_role'; end if;
  if exists (select 1 from public.boxes where id = p_box and owner_id = p_user) and p_role = 'athlete' then
    return json_build_object('ok', false, 'reason', 'owner');
  end if;
  update public.box_members set role = p_role where box_id = p_box and user_id = p_user;
  if p_role in ('coach', 'admin') then
    update public.profiles set role = 'coach' where id = p_user and role = 'athlete';
  end if;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- ─── MEMBER FILE (private to the administrator) ──────────────────────────────
create table if not exists public.member_files (
  box_id            uuid not null references public.boxes(id) on delete cascade,
  user_id           uuid not null references public.profiles(id) on delete cascade,
  phone             text check (phone is null or length(phone) <= 40),
  emergency_contact text check (emergency_contact is null or length(emergency_contact) <= 120),
  birth_date        date,
  notes             text check (notes is null or length(notes) <= 2000),
  updated_at        timestamptz not null default now(),
  primary key (box_id, user_id)
);
alter table public.member_files enable row level security;
drop policy if exists "Admin manages member files" on public.member_files;
create policy "Admin manages member files" on public.member_files for all to authenticated
  using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));

-- ─── PLANS AND MEMBERSHIPS ───────────────────────────────────────────────────
create table if not exists public.membership_plans (
  id            uuid primary key default gen_random_uuid(),
  box_id        uuid not null references public.boxes(id) on delete cascade,
  name          text not null check (length(name) between 1 and 60),
  kind          text not null default 'unlimited' check (kind in ('unlimited', 'classes')),
  classes_count int  check (classes_count is null or classes_count between 1 and 999),
  duration_days int  not null default 30 check (duration_days between 1 and 1100),
  price         numeric(12, 2) check (price is null or price >= 0),
  currency      text not null default 'CLP' check (length(currency) <= 5),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);
alter table public.membership_plans enable row level security;
drop policy if exists "Members read plans" on public.membership_plans;
create policy "Members read plans" on public.membership_plans for select to authenticated
  using (public.is_box_member(box_id) or public.is_box_admin(box_id));
drop policy if exists "Admin manages plans" on public.membership_plans;
create policy "Admin manages plans" on public.membership_plans for all to authenticated
  using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));

-- One row per contracted period. A renewal is a new row, so the history stays.
create table if not exists public.memberships (
  id            uuid primary key default gen_random_uuid(),
  box_id        uuid not null references public.boxes(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  plan_id       uuid references public.membership_plans(id) on delete set null,
  plan_name     text not null check (length(plan_name) <= 60),
  kind          text not null default 'unlimited' check (kind in ('unlimited', 'classes')),
  starts_on     date not null,
  ends_on       date not null,
  classes_total int,
  classes_used  int not null default 0,
  status        text not null default 'active' check (status in ('active', 'frozen', 'cancelled')),
  frozen_on     date,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists memberships_box_user on public.memberships (box_id, user_id, created_at desc);
alter table public.memberships enable row level security;
drop policy if exists "Own membership readable" on public.memberships;
create policy "Own membership readable" on public.memberships for select to authenticated
  using (user_id = auth.uid() or public.is_box_admin(box_id));
drop policy if exists "Admin manages memberships" on public.memberships;
create policy "Admin manages memberships" on public.memberships for all to authenticated
  using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));

-- Every movement of a membership: assigned, renewed, frozen, reactivated, cancelled, adjusted.
create table if not exists public.membership_events (
  id            uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  box_id        uuid not null references public.boxes(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  type          text not null check (type in ('assigned', 'renewed', 'frozen', 'reactivated', 'cancelled', 'adjusted')),
  happened_on   date not null default current_date,
  reason        text check (reason is null or length(reason) <= 300),
  days          int,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists membership_events_box on public.membership_events (box_id, user_id, created_at desc);
alter table public.membership_events enable row level security;
drop policy if exists "Own membership history readable" on public.membership_events;
create policy "Own membership history readable" on public.membership_events for select to authenticated
  using (user_id = auth.uid() or public.is_box_admin(box_id));
drop policy if exists "Admin writes membership history" on public.membership_events;
create policy "Admin writes membership history" on public.membership_events for insert to authenticated
  with check (public.is_box_admin(box_id));

-- ─── CLASS GRID ──────────────────────────────────────────────────────────────
-- A slot repeats every week (weekday 0 = Sunday … 6 = Saturday).
create table if not exists public.class_slots (
  id           uuid primary key default gen_random_uuid(),
  box_id       uuid not null references public.boxes(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6),
  start_time   time not null,
  duration_min int  not null default 60 check (duration_min between 15 and 240),
  name         text not null default 'CrossFit' check (length(name) between 1 and 40),
  capacity     int  not null default 16 check (capacity between 1 and 200),
  coach_id     uuid references public.profiles(id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists class_slots_box on public.class_slots (box_id, weekday, start_time);
alter table public.class_slots enable row level security;
drop policy if exists "Members read slots" on public.class_slots;
create policy "Members read slots" on public.class_slots for select to authenticated
  using (public.is_box_member(box_id) or public.is_box_admin(box_id));
drop policy if exists "Admin manages slots" on public.class_slots;
create policy "Admin manages slots" on public.class_slots for all to authenticated
  using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));

-- What changes for one date of a slot: another coach, cancelled, other capacity.
create table if not exists public.class_overrides (
  id            uuid primary key default gen_random_uuid(),
  slot_id       uuid not null references public.class_slots(id) on delete cascade,
  box_id        uuid not null references public.boxes(id) on delete cascade,
  class_date    date not null,
  coach_id      uuid references public.profiles(id) on delete set null,
  cancelled     boolean not null default false,
  cancel_reason text check (cancel_reason is null or length(cancel_reason) <= 200),
  capacity      int check (capacity is null or capacity between 1 and 200),
  created_at    timestamptz not null default now(),
  unique (slot_id, class_date)
);
alter table public.class_overrides enable row level security;
drop policy if exists "Members read overrides" on public.class_overrides;
create policy "Members read overrides" on public.class_overrides for select to authenticated
  using (public.is_box_member(box_id) or public.is_box_admin(box_id));
drop policy if exists "Admin manages overrides" on public.class_overrides;
create policy "Admin manages overrides" on public.class_overrides for all to authenticated
  using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));

-- Bookings. 'booked' past its date counts as attended unless the coach marks 'no_show'.
create table if not exists public.class_bookings (
  id          uuid primary key default gen_random_uuid(),
  slot_id     uuid not null references public.class_slots(id) on delete cascade,
  box_id      uuid not null references public.boxes(id) on delete cascade,
  class_date  date not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  status      text not null default 'booked' check (status in ('booked', 'waitlist', 'cancelled', 'attended', 'no_show')),
  created_at  timestamptz not null default now(),
  unique (slot_id, class_date, user_id)
);
create index if not exists class_bookings_box_date on public.class_bookings (box_id, class_date);
create index if not exists class_bookings_user on public.class_bookings (user_id, class_date);
alter table public.class_bookings enable row level security;
drop policy if exists "Members read bookings" on public.class_bookings;
create policy "Members read bookings" on public.class_bookings for select to authenticated
  using (public.is_box_member(box_id) or public.is_box_admin(box_id));
-- Writes go through the functions below (they check capacity, the plan and the waiting list).

-- The membership that is in force for a person in a box (latest one that isn't cancelled).
create or replace function public.current_membership(p_box uuid, p_user uuid)
returns public.memberships language sql stable security definer set search_path = public as $$
  select * from public.memberships
  where box_id = p_box and user_id = p_user and status <> 'cancelled'
  order by created_at desc limit 1;
$$;
revoke all on function public.current_membership(uuid, uuid) from public, anon, authenticated;

create or replace function public.book_class(p_slot uuid, p_date date, p_user uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := coalesce(p_user, auth.uid());
  v_slot  public.class_slots%rowtype;
  v_ov    public.class_overrides%rowtype;
  v_m     public.memberships%rowtype;
  v_cap   int;
  v_taken int;
  v_status text;
  v_prev  text;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_slot from public.class_slots where id = p_slot and is_active;
  if not found then return json_build_object('ok', false, 'reason', 'no_class'); end if;
  -- Booking for someone else (walk-in) is for coaches and the administrator.
  if v_uid <> auth.uid() and not public.is_box_coach(v_slot.box_id) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.box_members where box_id = v_slot.box_id and user_id = v_uid and is_active) then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if extract(dow from p_date)::int <> v_slot.weekday then return json_build_object('ok', false, 'reason', 'no_class'); end if;
  if p_date < current_date - 1 or p_date > current_date + 30 then return json_build_object('ok', false, 'reason', 'out_of_range'); end if;

  select * into v_ov from public.class_overrides where slot_id = p_slot and class_date = p_date;
  if v_ov.cancelled then return json_build_object('ok', false, 'reason', 'cancelled'); end if;
  v_cap := coalesce(v_ov.capacity, v_slot.capacity);

  select status into v_prev from public.class_bookings where slot_id = p_slot and class_date = p_date and user_id = v_uid;
  if v_prev in ('booked', 'waitlist', 'attended') then return json_build_object('ok', true, 'status', v_prev); end if;

  -- A box that uses plans: the plan must be in force and have classes left.
  select * into v_m from public.current_membership(v_slot.box_id, v_uid);
  if v_m.id is not null then
    if v_m.status = 'frozen' then return json_build_object('ok', false, 'reason', 'frozen'); end if;
    if v_m.ends_on < p_date then return json_build_object('ok', false, 'reason', 'expired'); end if;
    if v_m.kind = 'classes' and v_m.classes_used >= coalesce(v_m.classes_total, 0) then
      return json_build_object('ok', false, 'reason', 'no_classes');
    end if;
  end if;

  select count(*) into v_taken from public.class_bookings
    where slot_id = p_slot and class_date = p_date and status in ('booked', 'attended');
  v_status := case when v_taken >= v_cap then 'waitlist' else 'booked' end;

  insert into public.class_bookings (slot_id, box_id, class_date, user_id, status)
  values (p_slot, v_slot.box_id, p_date, v_uid, v_status)
  on conflict (slot_id, class_date, user_id) do update set status = excluded.status, created_at = now();

  if v_status = 'booked' and v_m.id is not null and v_m.kind = 'classes' then
    update public.memberships set classes_used = classes_used + 1 where id = v_m.id;
  end if;
  return json_build_object('ok', true, 'status', v_status);
end;
$$;
revoke all on function public.book_class(uuid, date, uuid) from public, anon;
grant execute on function public.book_class(uuid, date, uuid) to authenticated;

-- Cancels a booking, gives the class back to the plan and moves up the first person waiting.
create or replace function public.cancel_booking(p_slot uuid, p_date date, p_user uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := coalesce(p_user, auth.uid());
  v_b    public.class_bookings%rowtype;
  v_next public.class_bookings%rowtype;
  v_m    public.memberships%rowtype;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_b from public.class_bookings where slot_id = p_slot and class_date = p_date and user_id = v_uid;
  if not found then return json_build_object('ok', false, 'reason', 'no_booking'); end if;
  if v_uid <> auth.uid() and not public.is_box_coach(v_b.box_id) then raise exception 'not_allowed'; end if;
  if v_b.status = 'cancelled' then return json_build_object('ok', true); end if;

  update public.class_bookings set status = 'cancelled' where id = v_b.id;
  if v_b.status in ('booked', 'attended') then
    select * into v_m from public.current_membership(v_b.box_id, v_uid);
    if v_m.id is not null and v_m.kind = 'classes' then
      update public.memberships set classes_used = greatest(0, classes_used - 1) where id = v_m.id;
    end if;
    select * into v_next from public.class_bookings
      where slot_id = p_slot and class_date = p_date and status = 'waitlist' order by created_at limit 1;
    if found then
      update public.class_bookings set status = 'booked' where id = v_next.id;
      select * into v_m from public.current_membership(v_next.box_id, v_next.user_id);
      if v_m.id is not null and v_m.kind = 'classes' then
        update public.memberships set classes_used = classes_used + 1 where id = v_m.id;
      end if;
    end if;
  end if;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.cancel_booking(uuid, date, uuid) from public, anon;
grant execute on function public.cancel_booking(uuid, date, uuid) to authenticated;

-- The coach takes attendance: 'attended' or 'no_show' (a no-show still uses the class).
create or replace function public.mark_attendance(p_booking uuid, p_status text)
returns json language plpgsql security definer set search_path = public as $$
declare v_b public.class_bookings%rowtype;
begin
  if p_status not in ('attended', 'no_show', 'booked') then raise exception 'bad_status'; end if;
  select * into v_b from public.class_bookings where id = p_booking;
  if not found or not public.is_box_coach(v_b.box_id) then raise exception 'not_allowed'; end if;
  if v_b.status not in ('booked', 'attended', 'no_show') then return json_build_object('ok', false); end if;
  update public.class_bookings set status = p_status where id = p_booking;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.mark_attendance(uuid, text) from public, anon;
grant execute on function public.mark_attendance(uuid, text) to authenticated;

-- ─── COACH PROBLEMS AND REPLACEMENTS ─────────────────────────────────────────
create table if not exists public.coach_issues (
  id             uuid primary key default gen_random_uuid(),
  box_id         uuid not null references public.boxes(id) on delete cascade,
  coach_id       uuid not null references public.profiles(id) on delete cascade,
  slot_id        uuid references public.class_slots(id) on delete cascade,
  class_date     date not null,
  reason         text check (reason is null or length(reason) <= 300),
  status         text not null default 'open' check (status in ('open', 'resolved')),
  replacement_id uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  resolved_at    timestamptz
);
create index if not exists coach_issues_box on public.coach_issues (box_id, status, class_date);
alter table public.coach_issues enable row level security;
drop policy if exists "Coaches read issues" on public.coach_issues;
create policy "Coaches read issues" on public.coach_issues for select to authenticated
  using (coach_id = auth.uid() or public.is_box_coach(box_id));
drop policy if exists "Coach reports own issue" on public.coach_issues;
create policy "Coach reports own issue" on public.coach_issues for insert to authenticated
  with check (coach_id = auth.uid() and public.is_box_coach(box_id) and status = 'open' and replacement_id is null);
drop policy if exists "Admin resolves issues" on public.coach_issues;
create policy "Admin resolves issues" on public.coach_issues for update to authenticated
  using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));
drop policy if exists "Coach withdraws own issue" on public.coach_issues;
create policy "Coach withdraws own issue" on public.coach_issues for delete to authenticated
  using ((coach_id = auth.uid() and status = 'open') or public.is_box_admin(box_id));

-- ─── ANNOUNCEMENTS ───────────────────────────────────────────────────────────
-- The administrator writes to the coaches (or to everyone); a coach passes it on to the
-- athletes, to all of them or only to one weekday / one class.
create table if not exists public.announcements (
  id         uuid primary key default gen_random_uuid(),
  box_id     uuid not null references public.boxes(id) on delete cascade,
  author_id  uuid not null references public.profiles(id) on delete cascade,
  audience   text not null default 'coaches' check (audience in ('coaches', 'athletes', 'all')),
  title      text not null check (length(title) between 1 and 80),
  body       text check (body is null or length(body) <= 1500),
  urgent     boolean not null default false,
  starts_on  date not null default current_date,
  ends_on    date,
  weekday    smallint check (weekday is null or weekday between 0 and 6),
  slot_id    uuid references public.class_slots(id) on delete set null,
  parent_id  uuid references public.announcements(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_box on public.announcements (box_id, starts_on desc);
alter table public.announcements enable row level security;
drop policy if exists "Audience reads announcements" on public.announcements;
create policy "Audience reads announcements" on public.announcements for select to authenticated
  using (
    author_id = auth.uid() or public.is_box_admin(box_id)
    or (audience = 'coaches' and public.is_box_coach(box_id))
    or (audience in ('athletes', 'all') and public.is_box_member(box_id))
  );
drop policy if exists "Staff writes announcements" on public.announcements;
create policy "Staff writes announcements" on public.announcements for insert to authenticated
  with check (
    author_id = auth.uid()
    and (public.is_box_admin(box_id) or (public.is_box_coach(box_id) and audience = 'athletes'))
  );
drop policy if exists "Author edits announcement" on public.announcements;
create policy "Author edits announcement" on public.announcements for update to authenticated
  using (author_id = auth.uid() or public.is_box_admin(box_id))
  with check (author_id = auth.uid() or public.is_box_admin(box_id));
drop policy if exists "Author deletes announcement" on public.announcements;
create policy "Author deletes announcement" on public.announcements for delete to authenticated
  using (author_id = auth.uid() or public.is_box_admin(box_id));

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  read_at         timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
alter table public.announcement_reads enable row level security;
drop policy if exists "Reads visible to reader and staff" on public.announcement_reads;
create policy "Reads visible to reader and staff" on public.announcement_reads for select to authenticated
  using (user_id = auth.uid() or exists (
    select 1 from public.announcements a where a.id = announcement_id and (a.author_id = auth.uid() or public.is_box_admin(a.box_id))));
drop policy if exists "Reader marks as read" on public.announcement_reads;
create policy "Reader marks as read" on public.announcement_reads for insert to authenticated
  with check (user_id = auth.uid());


-- ================================================================
-- 011_platform_admin.sql
-- ================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- 011 · Application administrator (platform panel), product analytics and error log.
-- Safe to run more than once. Run after 010.
--
-- To make an account a platform administrator, run this by hand (it can't be done from the app):
--   insert into public.platform_admins (user_id)
--   select id from public.profiles where email = 'tu-correo@ejemplo.com';
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.platform_admins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- Each person can only find out whether they themselves are an administrator. No writes from the app.
drop policy if exists "Own admin flag" on public.platform_admins;
create policy "Own admin flag" on public.platform_admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.platform_admins where user_id = auth.uid());
$$;

-- Read access across boxes (read-only: the panel never edits people's data).
drop policy if exists "Platform admin reads profiles" on public.profiles;
create policy "Platform admin reads profiles" on public.profiles for select to authenticated using (public.is_platform_admin());
drop policy if exists "Platform admin reads boxes" on public.boxes;
create policy "Platform admin reads boxes" on public.boxes for select to authenticated using (public.is_platform_admin());
drop policy if exists "Platform admin reads members" on public.box_members;
create policy "Platform admin reads members" on public.box_members for select to authenticated using (public.is_platform_admin());

-- The one thing the panel changes: the plan of a box. Everything else stays with the box.
drop policy if exists "Platform admin updates boxes" on public.boxes;
create policy "Platform admin updates boxes" on public.boxes for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

create or replace function public.guard_box_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.owner_id is distinct from old.owner_id then raise exception 'No puedes cambiar el dueño del box'; end if;
    if new.plan is distinct from old.plan and not public.is_platform_admin() then raise exception 'No puedes cambiar el plan'; end if;
    -- A platform administrator may change the plan and nothing else.
    if public.is_platform_admin() and old.owner_id <> auth.uid()
       and (new.name, new.invite_code, new.slug) is distinct from (old.name, old.invite_code, old.slug) then
      raise exception 'Desde el panel solo se cambia el plan';
    end if;
  end if;
  return new;
end;
$$;

-- Every change made from the panel is written down.
create table if not exists public.admin_audit_log (
  id         bigint generated always as identity primary key,
  admin_id   uuid not null references public.profiles(id) on delete cascade,
  action     text not null check (length(action) <= 60),
  target     text check (target is null or length(target) <= 120),
  detail     jsonb,
  created_at timestamptz not null default now()
);
alter table public.admin_audit_log enable row level security;
drop policy if exists "Platform admin reads audit" on public.admin_audit_log;
create policy "Platform admin reads audit" on public.admin_audit_log for select to authenticated using (public.is_platform_admin());
drop policy if exists "Platform admin writes audit" on public.admin_audit_log;
create policy "Platform admin writes audit" on public.admin_audit_log for insert to authenticated
  with check (public.is_platform_admin() and admin_id = auth.uid());

-- ─── PRODUCT ANALYTICS ───────────────────────────────────────────────────────
-- What gets used: screens opened and buttons pressed. Never what a person types.
create table if not exists public.app_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  session_id text not null check (length(session_id) <= 40),
  kind       text not null check (kind in ('view', 'click', 'rage', 'action')),
  path       text not null check (length(path) <= 120),
  label      text check (label is null or length(label) <= 60),
  mode       text check (mode is null or mode in ('admin', 'coach', 'athlete')),
  box_id     uuid,
  device     text check (device is null or device in ('mobile', 'tablet', 'desktop')),
  installed  boolean,
  version    text check (version is null or length(version) <= 20),
  created_at timestamptz not null default now()
);
create index if not exists app_events_time on public.app_events (created_at desc);
create index if not exists app_events_user on public.app_events (user_id, created_at desc);
alter table public.app_events enable row level security;
drop policy if exists "Own events insert" on public.app_events;
create policy "Own events insert" on public.app_events for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Platform admin reads events" on public.app_events;
create policy "Platform admin reads events" on public.app_events for select to authenticated using (public.is_platform_admin());

-- ─── ERROR LOG ───────────────────────────────────────────────────────────────
create table if not exists public.app_errors (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles(id) on delete set null,
  fingerprint text not null check (length(fingerprint) <= 40),
  kind        text not null check (kind in ('error', 'promise', 'render', 'api')),
  message     text not null check (length(message) <= 500),
  stack       text check (stack is null or length(stack) <= 4000),
  path        text check (path is null or length(path) <= 120),
  mode        text check (mode is null or mode in ('admin', 'coach', 'athlete')),
  device      text check (device is null or device in ('mobile', 'tablet', 'desktop')),
  user_agent  text check (user_agent is null or length(user_agent) <= 300),
  version     text check (version is null or length(version) <= 20),
  created_at  timestamptz not null default now()
);
create index if not exists app_errors_time on public.app_errors (created_at desc);
create index if not exists app_errors_fp on public.app_errors (fingerprint, created_at desc);
alter table public.app_errors enable row level security;
drop policy if exists "Own errors insert" on public.app_errors;
create policy "Own errors insert" on public.app_errors for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Platform admin reads errors" on public.app_errors;
create policy "Platform admin reads errors" on public.app_errors for select to authenticated using (public.is_platform_admin());

-- Triage state of each distinct error.
create table if not exists public.app_error_status (
  fingerprint text primary key check (length(fingerprint) <= 40),
  status      text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  note        text check (note is null or length(note) <= 300),
  updated_by  uuid references public.profiles(id) on delete set null,
  updated_at  timestamptz not null default now()
);
alter table public.app_error_status enable row level security;
drop policy if exists "Platform admin manages error status" on public.app_error_status;
create policy "Platform admin manages error status" on public.app_error_status for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- Distinct errors of the last days, most recent first.
create or replace function public.admin_errors(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return coalesce((
    select jsonb_agg(g order by g.last_seen desc) from (
      select e.fingerprint,
             (array_agg(e.message order by e.created_at desc))[1] as message,
             (array_agg(e.stack order by e.created_at desc))[1] as stack,
             (array_agg(e.kind order by e.created_at desc))[1] as kind,
             count(*) as count, count(distinct e.user_id) as users,
             min(e.created_at) as first_seen, max(e.created_at) as last_seen,
             (select jsonb_agg(distinct p.path) from public.app_errors p where p.fingerprint = e.fingerprint and p.created_at >= now() - make_interval(days => p_days)) as paths,
             (select jsonb_agg(distinct p.version) from public.app_errors p where p.fingerprint = e.fingerprint and p.created_at >= now() - make_interval(days => p_days)) as versions,
             (select jsonb_agg(distinct p.device) from public.app_errors p where p.fingerprint = e.fingerprint and p.created_at >= now() - make_interval(days => p_days)) as devices,
             coalesce(s.status, 'open') as status, s.note, s.updated_at as status_at
      from public.app_errors e left join public.app_error_status s on s.fingerprint = e.fingerprint
      where e.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
      group by e.fingerprint, s.status, s.note, s.updated_at
      limit 200
    ) g), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_errors(int) from public, anon;
grant execute on function public.admin_errors(int) to authenticated;

-- Everything the usage screens need, in one call.
create or replace function public.admin_usage(p_days int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_days int := least(greatest(p_days, 1), 90);
  v_from timestamptz := now() - make_interval(days => v_days);
  v_year int := extract(year from now())::int;
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return jsonb_build_object(
    'days', v_days,
    'totals', jsonb_build_object(
      'users', (select count(*) from public.profiles),
      'boxes', (select count(*) from public.boxes),
      'coaches', (select count(distinct user_id) from public.box_members where role in ('coach', 'admin') and is_active),
      'athletes', (select count(distinct user_id) from public.box_members where role = 'athlete' and is_active),
      'new_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
      'dau', (select count(distinct user_id) from public.app_events where created_at >= now() - interval '1 day'),
      'wau', (select count(distinct user_id) from public.app_events where created_at >= now() - interval '7 days'),
      'mau', (select count(distinct user_id) from public.app_events where created_at >= now() - interval '30 days'),
      'sessions', (select count(distinct session_id) from public.app_events where created_at >= v_from),
      'open_errors', (select count(distinct e.fingerprint) from public.app_errors e left join public.app_error_status s on s.fingerprint = e.fingerprint
                      where e.created_at >= now() - interval '14 days' and (s.status is null or s.status = 'open' or (s.status = 'resolved' and e.created_at > s.updated_at)))
    ),
    -- Of the people active the previous week, how many came back this week.
    'retention', (
      select jsonb_build_object('before', count(*), 'kept', count(*) filter (where exists (
        select 1 from public.app_events n where n.user_id = p.user_id and n.created_at >= now() - interval '7 days')))
      from (select distinct user_id from public.app_events where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') p),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'users', users, 'events', events) order by d) from (
      select (created_at at time zone 'America/Santiago')::date as d, count(distinct user_id) as users, count(*) as events
      from public.app_events where created_at >= v_from group by 1) x), '[]'::jsonb),
    'signups', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d) from (
      select date_trunc('week', created_at)::date as d, count(*) as n from public.profiles
      where created_at >= now() - interval '12 weeks' group by 1) x), '[]'::jsonb),
    'modes', coalesce((select jsonb_agg(jsonb_build_object('k', mode, 'users', users, 'events', events) order by users desc) from (
      select coalesce(mode, 'athlete') as mode, count(distinct user_id) as users, count(*) as events
      from public.app_events where created_at >= v_from group by 1) x), '[]'::jsonb),
    'screens', coalesce((select jsonb_agg(jsonb_build_object('k', path, 'mode', mode, 'n', n, 'users', users) order by n desc) from (
      select path, coalesce(mode, 'athlete') as mode, count(*) as n, count(distinct user_id) as users
      from public.app_events where kind = 'view' and created_at >= v_from group by 1, 2 order by 3 desc limit 60) x), '[]'::jsonb),
    'clicks', coalesce((select jsonb_agg(jsonb_build_object('k', label, 'path', path, 'n', n, 'users', users) order by n desc) from (
      select label, path, count(*) as n, count(distinct user_id) as users
      from public.app_events where kind = 'click' and label is not null and created_at >= v_from group by 1, 2 order by 3 desc limit 40) x), '[]'::jsonb),
    'rage', coalesce((select jsonb_agg(jsonb_build_object('k', label, 'path', path, 'n', n, 'users', users) order by n desc) from (
      select coalesce(label, '(sin texto)') as label, path, count(*) as n, count(distinct user_id) as users
      from public.app_events where kind = 'rage' and created_at >= v_from group by 1, 2 order by 3 desc limit 15) x), '[]'::jsonb),
    'devices', coalesce((select jsonb_agg(jsonb_build_object('k', device, 'users', users, 'installed', installed) order by users desc) from (
      select coalesce(device, 'desktop') as device, count(distinct user_id) as users, count(distinct user_id) filter (where installed) as installed
      from public.app_events where created_at >= v_from group by 1) x), '[]'::jsonb),
    'hours', coalesce((select jsonb_agg(jsonb_build_object('h', h, 'n', n) order by h) from (
      select extract(hour from created_at at time zone 'America/Santiago')::int as h, count(distinct session_id) as n
      from public.app_events where created_at >= v_from group by 1) x), '[]'::jsonb),
    'weekdays', coalesce((select jsonb_agg(jsonb_build_object('d', d, 'n', n) order by d) from (
      select extract(dow from created_at at time zone 'America/Santiago')::int as d, count(distinct user_id) as n
      from public.app_events where created_at >= v_from group by 1) x), '[]'::jsonb),
    'ages', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n) order by k) from (
      select case when birth_year is null then 'Sin dato'
                  when v_year - birth_year < 18 then '-18' when v_year - birth_year < 25 then '18-24'
                  when v_year - birth_year < 35 then '25-34' when v_year - birth_year < 45 then '35-44'
                  when v_year - birth_year < 55 then '45-54' else '55+' end as k, count(*) as n
      from public.profiles group by 1) x), '[]'::jsonb),
    'sex', coalesce((select jsonb_agg(jsonb_build_object('k', k, 'n', n)) from (
      select coalesce(sex, 'Sin dato') as k, count(*) as n from public.profiles group by 1) x), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(jsonb_build_object('k', version, 'users', users) order by users desc) from (
      select coalesce(version, '?') as version, count(distinct user_id) as users
      from public.app_events where created_at >= now() - interval '7 days' group by 1) x), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.admin_usage(int) from public, anon;
grant execute on function public.admin_usage(int) to authenticated;

-- Last time each person used the app (for the users list).
create or replace function public.admin_last_seen()
returns table (user_id uuid, last_seen timestamptz, events_30d bigint)
language sql stable security definer set search_path = public as $$
  select e.user_id, max(e.created_at), count(*) from public.app_events e
  where public.is_platform_admin() and e.created_at >= now() - interval '30 days' group by e.user_id;
$$;
revoke all on function public.admin_last_seen() from public, anon;
grant execute on function public.admin_last_seen() to authenticated;

-- Keep the tables small: events older than 180 days and errors older than 90 can go.
-- (Run from the SQL editor or a scheduled job.)
--   delete from public.app_events where created_at < now() - interval '180 days';
--   delete from public.app_errors where created_at < now() - interval '90 days';


-- ================================================================
-- 012_banners_support.sql
-- ================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- 012 · Banners on the home screen, support requests from users, and the steps
--       that led to each error.
-- Safe to run more than once. Run after 011.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── BANNERS ─────────────────────────────────────────────────────────────────
-- A card on top of the home screen that opens something when pressed.
-- box_id set  → written by that box's administrator, seen by its members.
-- box_id null → written by the application administrator, seen by everyone.
create table if not exists public.banners (
  id          uuid primary key default gen_random_uuid(),
  box_id      uuid references public.boxes(id) on delete cascade,
  created_by  uuid references public.profiles(id) on delete set null,
  title       text not null check (length(title) between 1 and 60),
  body        text check (body is null or length(body) <= 140),
  cta_label   text check (cta_label is null or length(cta_label) <= 24),
  -- Where it goes: a screen of the app ("/classes") or a full https address.
  href        text check (href is null or (length(href) <= 300 and (href ~ '^/[^/\\]' or href ~ '^https://'))),
  tone        text not null default 'accent' check (tone in ('accent', 'blue', 'green', 'orange', 'red', 'purple', 'dark')),
  icon        text not null default 'megaphone' check (length(icon) <= 24),
  image_url   text check (image_url is null or (length(image_url) <= 400 and image_url ~ '^https://')),
  audience    text not null default 'all' check (audience in ('all', 'athletes', 'coaches')),
  starts_on   date not null default current_date,
  ends_on     date,
  position    int  not null default 0,
  dismissible boolean not null default true,
  is_active   boolean not null default true,
  views       int not null default 0,
  clicks      int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists banners_box on public.banners (box_id, is_active, position);
alter table public.banners enable row level security;

drop policy if exists "Members read banners" on public.banners;
create policy "Members read banners" on public.banners for select to authenticated
  using (box_id is null or public.is_box_member(box_id) or public.is_box_admin(box_id) or public.is_platform_admin());
drop policy if exists "Admins write banners" on public.banners;
create policy "Admins write banners" on public.banners for all to authenticated
  using ((box_id is not null and public.is_box_admin(box_id)) or (box_id is null and public.is_platform_admin()))
  with check ((box_id is not null and public.is_box_admin(box_id)) or (box_id is null and public.is_platform_admin()));

-- Counts a view or a press (the counters aren't writable by members directly).
create or replace function public.banner_hit(p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.banners b where b.id = p_id and (b.box_id is null or public.is_box_member(b.box_id) or public.is_box_admin(b.box_id))) then return; end if;
  if p_kind = 'click' then update public.banners set clicks = clicks + 1 where id = p_id;
  elsif p_kind = 'view' then update public.banners set views = views + 1 where id = p_id;
  end if;
end;
$$;
revoke all on function public.banner_hit(uuid, text) from public, anon;
grant execute on function public.banner_hit(uuid, text) to authenticated;

-- ─── SUPPORT REQUESTS ────────────────────────────────────────────────────────
create table if not exists public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  box_id     uuid references public.boxes(id) on delete set null,
  kind       text not null default 'bug' check (kind in ('bug', 'idea', 'question', 'account')),
  message    text not null check (length(message) between 5 and 2000),
  path       text check (path is null or length(path) <= 120),
  -- What the app knew when it was sent: version, device, mode, recent errors and last steps.
  context    jsonb,
  status     text not null default 'open' check (status in ('open', 'answered', 'closed')),
  reply      text check (reply is null or length(reply) <= 2000),
  replied_by uuid references public.profiles(id) on delete set null,
  replied_at timestamptz,
  seen_reply boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists support_tickets_user on public.support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status on public.support_tickets (status, created_at desc);
alter table public.support_tickets enable row level security;

drop policy if exists "Own tickets readable" on public.support_tickets;
create policy "Own tickets readable" on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
drop policy if exists "Own tickets insert" on public.support_tickets;
create policy "Own tickets insert" on public.support_tickets for insert to authenticated
  with check (user_id = auth.uid() and status = 'open' and reply is null and replied_by is null);
drop policy if exists "Support answers tickets" on public.support_tickets;
create policy "Support answers tickets" on public.support_tickets for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- At most 5 requests per hour per person, so the inbox can't be flooded.
create or replace function public.guard_ticket_rate()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.support_tickets where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Ya enviaste varios mensajes hace poco. Espera un rato antes de enviar otro.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_ticket_rate on public.support_tickets;
create trigger trg_guard_ticket_rate before insert on public.support_tickets
  for each row execute function public.guard_ticket_rate();

-- The person marks the answer as read (the only thing they may change in their ticket).
create or replace function public.ticket_seen(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update public.support_tickets set seen_reply = true where id = p_id and user_id = auth.uid();
$$;
revoke all on function public.ticket_seen(uuid) from public, anon;
grant execute on function public.ticket_seen(uuid) to authenticated;

-- ─── ERRORS: the last steps before each failure ──────────────────────────────
alter table public.app_errors add column if not exists trail jsonb;

-- The error list in the panel also shows the last steps before the most recent occurrence.
create or replace function public.admin_errors(p_days int default 14)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return coalesce((
    select jsonb_agg(g order by g.last_seen desc) from (
      select e.fingerprint,
             (array_agg(e.message order by e.created_at desc))[1] as message,
             (array_agg(e.stack order by e.created_at desc))[1] as stack,
             (array_agg(e.kind order by e.created_at desc))[1] as kind,
             (array_agg(e.trail order by e.created_at desc))[1] as trail,
             count(*) as count, count(distinct e.user_id) as users,
             min(e.created_at) as first_seen, max(e.created_at) as last_seen,
             jsonb_agg(distinct e.path) as paths, jsonb_agg(distinct e.version) as versions, jsonb_agg(distinct e.device) as devices,
             coalesce(s.status, 'open') as status, s.note, s.updated_at as status_at
      from public.app_errors e left join public.app_error_status s on s.fingerprint = e.fingerprint
      where e.created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90))
      group by e.fingerprint, s.status, s.note, s.updated_at
      order by max(e.created_at) desc
      limit 200
    ) g), '[]'::jsonb);
end;
$$;
revoke all on function public.admin_errors(int) from public, anon;
grant execute on function public.admin_errors(int) to authenticated;


-- ================================================================
-- 013_audit_fixes.sql
-- ================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- 013 · Fixes from the security and data audit of 010–012.
-- Safe to run more than once. Run after 012.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Members: an administrator can only switch a person on or off ─────────
-- Before, an admin could rewrite user_id/role of any row in their box (and pull other
-- people into it). Roles change only through set_member_role().
revoke update on public.box_members from authenticated;
grant update (is_active, left_at) on public.box_members to authenticated;

create or replace function public.guard_member_row()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and new.is_active = false
     and exists (select 1 from public.boxes where id = new.box_id and owner_id = new.user_id) then
    raise exception 'El dueño del box no se puede dar de baja';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_member_row on public.box_members;
create trigger trg_guard_member_row before update on public.box_members
  for each row execute function public.guard_member_row();

-- A person who left (or was removed) can't delete their row to come back with a clean slate.
drop policy if exists "Members can leave" on public.box_members;
create policy "Members can leave" on public.box_members for delete using (auth.uid() = user_id and is_active);

-- Rejoining with the invite code: never brings back an old coach/admin role, and someone the
-- administrator removed can't come back on their own.
create or replace function public.join_box_by_code(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_box public.boxes%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_box from public.boxes where invite_code = upper(trim(p_code));
  if not found then return json_build_object('ok', false, 'reason', 'invalid_code'); end if;
  if exists (select 1 from public.box_members where box_id = v_box.id and user_id = v_uid and is_active) then
    return json_build_object('ok', false, 'reason', 'already_member', 'box_name', v_box.name);
  end if;
  if exists (select 1 from public.box_members where box_id = v_box.id and user_id = v_uid and not is_active and left_at is not null) then
    return json_build_object('ok', false, 'reason', 'removed', 'box_name', v_box.name);
  end if;
  insert into public.box_members (box_id, user_id, role, is_active)
  values (v_box.id, v_uid, 'athlete', true)
  on conflict (box_id, user_id) do update set is_active = true, role = 'athlete';
  return json_build_object('ok', true, 'box_id', v_box.id, 'box_name', v_box.name);
end;
$$;
revoke all on function public.join_box_by_code(text) from public, anon;
grant execute on function public.join_box_by_code(text) to authenticated;

-- Only people who are in the box can get a role there.
create or replace function public.set_member_role(p_box uuid, p_user uuid, p_role text)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_box_admin(p_box) then raise exception 'not_allowed'; end if;
  if p_role not in ('athlete', 'coach', 'admin') then raise exception 'bad_role'; end if;
  if exists (select 1 from public.boxes where id = p_box and owner_id = p_user) and p_role <> 'admin' then
    return json_build_object('ok', false, 'reason', 'owner');
  end if;
  update public.box_members set role = p_role where box_id = p_box and user_id = p_user and is_active;
  if not found then return json_build_object('ok', false, 'reason', 'not_member'); end if;
  if p_role in ('coach', 'admin') then
    update public.profiles set role = 'coach' where id = p_user and role = 'athlete';
  end if;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.set_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated;

-- ─── 2. A class change, a coach notice or an announcement must belong to the slot's own box ─
delete from public.class_overrides o using public.class_slots s where s.id = o.slot_id and s.box_id <> o.box_id;
update public.coach_issues i set slot_id = null from public.class_slots s where s.id = i.slot_id and s.box_id <> i.box_id;
update public.announcements a set slot_id = null from public.class_slots s where s.id = a.slot_id and s.box_id <> a.box_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'class_slots_id_box') then
    alter table public.class_slots add constraint class_slots_id_box unique (id, box_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'class_overrides_slot_box') then
    alter table public.class_overrides add constraint class_overrides_slot_box
      foreign key (slot_id, box_id) references public.class_slots (id, box_id) on delete cascade;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'coach_issues_slot_box') then
    alter table public.coach_issues add constraint coach_issues_slot_box
      foreign key (slot_id, box_id) references public.class_slots (id, box_id) on delete set null (slot_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'announcements_slot_box') then
    alter table public.announcements add constraint announcements_slot_box
      foreign key (slot_id, box_id) references public.class_slots (id, box_id) on delete set null (slot_id);
  end if;
end $$;

-- ─── 3. Announcements: an author can't move a notice to another box or widen its audience ──
drop policy if exists "Author edits announcement" on public.announcements;
create policy "Author edits announcement" on public.announcements for update to authenticated
  using (author_id = auth.uid() or public.is_box_admin(box_id))
  with check (public.is_box_admin(box_id) or (author_id = auth.uid() and public.is_box_coach(box_id) and audience = 'athletes'));

-- Marking as read twice must not fail (the upsert needs an update rule).
drop policy if exists "Reader updates own read" on public.announcement_reads;
create policy "Reader updates own read" on public.announcement_reads for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─── 4. Older tables: updates keep the row inside a box the person may write to ──────────
drop policy if exists "Edit own or box events" on public.events;
create policy "Edit own or box events" on public.events for update
  using (created_by = auth.uid() or (box_id is not null and public.is_box_coach(box_id)))
  with check ((created_by = auth.uid() and (box_id is null or public.is_box_coach(box_id))) or (box_id is not null and public.is_box_coach(box_id)));

drop policy if exists "Creator or coach edits challenge" on public.challenges;
create policy "Creator or coach edits challenge" on public.challenges for update
  using (created_by = auth.uid() or public.is_box_coach(box_id))
  with check (public.is_box_member(box_id) or public.is_box_coach(box_id));

drop policy if exists "Coach can update templates" on public.wod_templates;
create policy "Coach can update templates" on public.wod_templates for update
  using (created_by = auth.uid() or public.is_box_coach(box_id))
  with check ((box_id is null and created_by = auth.uid()) or (box_id is not null and public.is_box_coach(box_id)));

-- ─── 5. Bookings: one membership per date, locks, time rules, and cancelled classes ──────
-- The plan in force on a date: started on or before it, newest first. A renewal that starts
-- next week no longer takes over today's bookings.
create or replace function public.membership_on(p_box uuid, p_user uuid, p_date date)
returns public.memberships language sql stable security definer set search_path = public as $$
  select * from public.memberships
  where box_id = p_box and user_id = p_user and status <> 'cancelled' and starts_on <= p_date
  order by starts_on desc, created_at desc limit 1;
$$;
revoke all on function public.membership_on(uuid, uuid, date) from public, anon, authenticated;

-- Why a person can't take a class on a date (null = they can).
create or replace function public.booking_block(p_box uuid, p_user uuid, p_date date)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_m public.memberships%rowtype;
begin
  select * into v_m from public.membership_on(p_box, p_user, p_date);
  if v_m.id is null then
    -- Someone who never had a plan here books freely (boxes that don't use plans);
    -- someone whose plan was cancelled or hasn't started doesn't.
    if exists (select 1 from public.memberships where box_id = p_box and user_id = p_user) then return 'no_plan'; end if;
    return null;
  end if;
  if v_m.status = 'frozen' then return 'frozen'; end if;
  if v_m.ends_on < p_date then return 'expired'; end if;
  if v_m.kind = 'classes' and v_m.classes_used >= coalesce(v_m.classes_total, 0) then return 'no_classes'; end if;
  return null;
end;
$$;
revoke all on function public.booking_block(uuid, uuid, date) from public, anon, authenticated;

-- Spends (+1) or gives back (-1) a class of the class pack in force on that date.
create or replace function public.spend_class(p_box uuid, p_user uuid, p_date date, p_n int)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.membership_on(p_box, p_user, p_date);
  if v_id is null then return; end if;
  perform 1 from public.memberships where id = v_id for update;
  update public.memberships set classes_used = greatest(0, classes_used + p_n) where id = v_id and kind = 'classes';
end;
$$;
revoke all on function public.spend_class(uuid, uuid, date, int) from public, anon, authenticated;

create or replace function public.book_class(p_slot uuid, p_date date, p_user uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := coalesce(p_user, auth.uid());
  v_slot   public.class_slots%rowtype;
  v_ov     public.class_overrides%rowtype;
  v_staff  boolean;
  v_cap    int;
  v_taken  int;
  v_status text;
  v_prev   text;
  v_block  text;
  v_today  date := public.app_today();
  v_now    time := (now() at time zone 'America/Santiago')::time;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  -- Locking the slot makes concurrent bookings of the same class wait their turn.
  select * into v_slot from public.class_slots where id = p_slot and is_active for update;
  if not found then return json_build_object('ok', false, 'reason', 'no_class'); end if;
  v_staff := public.is_box_coach(v_slot.box_id);
  if v_uid <> auth.uid() and not v_staff then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.box_members where box_id = v_slot.box_id and user_id = v_uid and is_active) then
    return json_build_object('ok', false, 'reason', 'not_member');
  end if;
  if extract(dow from p_date)::int <> v_slot.weekday then return json_build_object('ok', false, 'reason', 'no_class'); end if;
  if p_date > v_today + 30 then return json_build_object('ok', false, 'reason', 'out_of_range'); end if;
  -- Athletes book before the class starts; coaches can add someone up to a week later.
  if not v_staff and (p_date < v_today or (p_date = v_today and v_slot.start_time <= v_now)) then
    return json_build_object('ok', false, 'reason', 'too_late');
  end if;
  if v_staff and p_date < v_today - 7 then return json_build_object('ok', false, 'reason', 'out_of_range'); end if;

  select * into v_ov from public.class_overrides where slot_id = p_slot and box_id = v_slot.box_id and class_date = p_date;
  if v_ov.cancelled then return json_build_object('ok', false, 'reason', 'cancelled'); end if;
  v_cap := coalesce(v_ov.capacity, v_slot.capacity);

  select status into v_prev from public.class_bookings where slot_id = p_slot and class_date = p_date and user_id = v_uid;
  if v_prev in ('booked', 'waitlist', 'attended') then return json_build_object('ok', true, 'status', v_prev); end if;
  if v_prev = 'no_show' and not v_staff then return json_build_object('ok', true, 'status', v_prev); end if;

  v_block := public.booking_block(v_slot.box_id, v_uid, p_date);
  if v_block is not null then return json_build_object('ok', false, 'reason', v_block); end if;

  select count(*) into v_taken from public.class_bookings
    where slot_id = p_slot and class_date = p_date and status in ('booked', 'attended', 'no_show');
  v_status := case when v_taken >= v_cap then 'waitlist' else 'booked' end;

  insert into public.class_bookings (slot_id, box_id, class_date, user_id, status)
  values (p_slot, v_slot.box_id, p_date, v_uid, v_status)
  on conflict (slot_id, class_date, user_id) do update set status = excluded.status, created_at = now();
  if v_status = 'booked' then perform public.spend_class(v_slot.box_id, v_uid, p_date, 1); end if;
  return json_build_object('ok', true, 'status', v_status);
end;
$$;
revoke all on function public.book_class(uuid, date, uuid) from public, anon;
grant execute on function public.book_class(uuid, date, uuid) to authenticated;

-- Moves the first waiting person who still has a valid plan into the class.
create or replace function public.promote_waitlist(p_slot uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare r public.class_bookings%rowtype;
begin
  for r in select * from public.class_bookings where slot_id = p_slot and class_date = p_date and status = 'waitlist' order by created_at loop
    if public.booking_block(r.box_id, r.user_id, p_date) is null then
      update public.class_bookings set status = 'booked' where id = r.id;
      perform public.spend_class(r.box_id, r.user_id, p_date, 1);
      return;
    end if;
  end loop;
end;
$$;
revoke all on function public.promote_waitlist(uuid, date) from public, anon, authenticated;

create or replace function public.cancel_booking(p_slot uuid, p_date date, p_user uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := coalesce(p_user, auth.uid());
  v_b     public.class_bookings%rowtype;
  v_slot  public.class_slots%rowtype;
  v_staff boolean;
  v_today date := public.app_today();
  v_now   time := (now() at time zone 'America/Santiago')::time;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_slot from public.class_slots where id = p_slot for update;
  select * into v_b from public.class_bookings where slot_id = p_slot and class_date = p_date and user_id = v_uid;
  if not found then return json_build_object('ok', false, 'reason', 'no_booking'); end if;
  v_staff := public.is_box_coach(v_b.box_id);
  if v_uid <> auth.uid() and not v_staff then raise exception 'not_allowed'; end if;
  if v_b.status = 'cancelled' then return json_build_object('ok', true); end if;
  -- Once the class started (or attendance was taken), only a coach can undo it.
  if not v_staff and (v_b.status in ('attended', 'no_show') or p_date < v_today or (p_date = v_today and v_slot.start_time <= v_now)) then
    return json_build_object('ok', false, 'reason', 'too_late');
  end if;

  update public.class_bookings set status = 'cancelled' where id = v_b.id;
  if v_b.status in ('booked', 'attended', 'no_show') then
    perform public.spend_class(v_b.box_id, v_uid, p_date, -1);
    if p_date >= v_today then perform public.promote_waitlist(p_slot, p_date); end if;
  end if;
  return json_build_object('ok', true);
end;
$$;
revoke all on function public.cancel_booking(uuid, date, uuid) from public, anon;
grant execute on function public.cancel_booking(uuid, date, uuid) to authenticated;

-- A class cancelled by the box cancels its bookings and gives the classes back.
create or replace function public.on_class_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.class_bookings%rowtype;
begin
  if new.cancelled and (tg_op = 'INSERT' or not coalesce(old.cancelled, false)) then
    for r in select * from public.class_bookings where slot_id = new.slot_id and class_date = new.class_date and status <> 'cancelled' loop
      update public.class_bookings set status = 'cancelled' where id = r.id;
      if r.status in ('booked', 'attended', 'no_show') then perform public.spend_class(r.box_id, r.user_id, r.class_date, -1); end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_on_class_cancelled on public.class_overrides;
create trigger trg_on_class_cancelled after insert or update of cancelled on public.class_overrides
  for each row execute function public.on_class_cancelled();

-- A weekly slot taken off the grid cancels its future bookings (past ones stay as history).
create or replace function public.on_slot_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare r public.class_bookings%rowtype;
begin
  if old.is_active and not new.is_active then
    for r in select * from public.class_bookings where slot_id = new.id and class_date >= public.app_today() and status <> 'cancelled' loop
      update public.class_bookings set status = 'cancelled' where id = r.id;
      if r.status = 'booked' then perform public.spend_class(r.box_id, r.user_id, r.class_date, -1); end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_on_slot_removed on public.class_slots;
create trigger trg_on_slot_removed after update of is_active on public.class_slots
  for each row execute function public.on_slot_removed();

-- History can't be erased from the app: slots and plans are switched off, never deleted.
drop policy if exists "Admin manages slots" on public.class_slots;
drop policy if exists "Admin creates slots" on public.class_slots;
drop policy if exists "Admin edits slots" on public.class_slots;
create policy "Admin creates slots" on public.class_slots for insert to authenticated with check (public.is_box_admin(box_id));
create policy "Admin edits slots" on public.class_slots for update to authenticated using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));

drop policy if exists "Admin manages memberships" on public.memberships;
drop policy if exists "Admin creates memberships" on public.memberships;
drop policy if exists "Admin edits memberships" on public.memberships;
create policy "Admin creates memberships" on public.memberships for insert to authenticated with check (public.is_box_admin(box_id));
create policy "Admin edits memberships" on public.memberships for update to authenticated using (public.is_box_admin(box_id)) with check (public.is_box_admin(box_id));

-- ─── 6. Usage data and errors: size limits and a ceiling per person ───────────────────
create index if not exists app_errors_user on public.app_errors (user_id, created_at desc);
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_errors_trail_size') then
    alter table public.app_errors add constraint app_errors_trail_size check (trail is null or pg_column_size(trail) <= 4096) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'support_tickets_context_size') then
    alter table public.support_tickets add constraint support_tickets_context_size check (context is null or pg_column_size(context) <= 8192) not valid;
  end if;
end $$;

-- Rows over the hourly ceiling are dropped quietly (the app never needs that many).
create or replace function public.guard_telemetry_rate()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int; v_max int := case when tg_table_name = 'app_errors' then 60 else 1500 end;
begin
  execute format('select count(*) from public.%I where user_id = $1 and created_at > now() - interval ''1 hour''', tg_table_name) into v_n using new.user_id;
  if v_n >= v_max then return null; end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_events_rate on public.app_events;
create trigger trg_guard_events_rate before insert on public.app_events for each row execute function public.guard_telemetry_rate();
drop trigger if exists trg_guard_errors_rate on public.app_errors;
create trigger trg_guard_errors_rate before insert on public.app_errors for each row execute function public.guard_telemetry_rate();

-- The error status keeps the server's time (a slow browser clock made errors look reopened).
create or replace function public.touch_error_status()
returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end; $$;
drop trigger if exists trg_touch_error_status on public.app_error_status;
create trigger trg_touch_error_status before insert or update on public.app_error_status for each row execute function public.touch_error_status();

-- The panel's badge only needs this number; the full usage report is heavy.
create or replace function public.admin_open_counts()
returns json language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return json_build_object(
    'errors', (select count(distinct e.fingerprint) from public.app_errors e left join public.app_error_status s on s.fingerprint = e.fingerprint
               where e.created_at >= now() - interval '14 days' and (s.status is null or s.status = 'open' or (s.status = 'resolved' and e.created_at > s.updated_at))),
    'tickets', (select count(*) from public.support_tickets where status = 'open'));
end;
$$;
revoke all on function public.admin_open_counts() from public, anon;
grant execute on function public.admin_open_counts() to authenticated;

-- People active in the chosen period, for "sessions per person".
create or replace function public.admin_period_users(p_days int default 30)
returns bigint language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then raise exception 'not_allowed'; end if;
  return (select count(distinct user_id) from public.app_events where created_at >= now() - make_interval(days => least(greatest(p_days, 1), 90)));
end;
$$;
revoke all on function public.admin_period_users(int) from public, anon;
grant execute on function public.admin_period_users(int) to authenticated;

-- ─── 7. Banners ──────────────────────────────────────────────────────────────
alter table public.banners drop constraint if exists banners_href_check;
alter table public.banners add constraint banners_href_check check (href is null or (length(href) <= 300 and (
  href ~ '^/[A-Za-z0-9][^[:space:][:cntrl:]\\]*$' or href ~ '^https://[^[:space:][:cntrl:]]+$')));
-- Only images stored in the app's own storage (the browser blocks other hosts anyway).
alter table public.banners drop constraint if exists banners_image_url_check;
alter table public.banners add constraint banners_image_url_check check (image_url is null or (length(image_url) <= 400 and
  image_url ~ '^https://[a-z0-9]+\.supabase\.co/storage/v1/object/public/'));

drop policy if exists "Members read banners" on public.banners;
create policy "Members read banners" on public.banners for select to authenticated using (
  public.is_platform_admin() or public.is_box_admin(box_id)
  or (box_id is null and (audience in ('all', 'athletes') or exists (select 1 from public.box_members where user_id = auth.uid() and is_active and role <> 'athlete')))
  or (box_id is not null and (audience = 'all' or (audience = 'coaches' and public.is_box_coach(box_id)) or (audience = 'athletes' and public.is_box_member(box_id))))
);

-- One view and one press per person, banner and day.
create table if not exists public.banner_hits (
  banner_id uuid not null references public.banners(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  day       date not null,
  kind      text not null check (kind in ('view', 'click')),
  primary key (banner_id, user_id, day, kind)
);
alter table public.banner_hits enable row level security;  -- written only by banner_hit()

create or replace function public.banner_hit(p_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_kind not in ('view', 'click') then return; end if;
  if not exists (select 1 from public.banners b where b.id = p_id and (b.box_id is null or public.is_box_member(b.box_id) or public.is_box_admin(b.box_id))) then return; end if;
  insert into public.banner_hits (banner_id, user_id, day, kind) values (p_id, auth.uid(), public.app_today(), p_kind) on conflict do nothing;
  if not found then return; end if;
  if p_kind = 'click' then update public.banners set clicks = clicks + 1 where id = p_id;
  else update public.banners set views = views + 1 where id = p_id; end if;
end;
$$;
revoke all on function public.banner_hit(uuid, text) from public, anon;
grant execute on function public.banner_hit(uuid, text) to authenticated;

-- ─── 8. The panel changes only the plan of a box, and the change is always logged ────────
create or replace function public.guard_box_fields()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.owner_id is distinct from old.owner_id then raise exception 'No puedes cambiar el dueño del box'; end if;
    if new.plan is distinct from old.plan and not public.is_platform_admin() then raise exception 'No puedes cambiar el plan'; end if;
    if public.is_platform_admin() and old.owner_id <> auth.uid() and (to_jsonb(new) - 'plan') is distinct from (to_jsonb(old) - 'plan') then
      raise exception 'Desde el panel solo se cambia el plan';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.log_box_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.plan is distinct from old.plan and auth.uid() is not null then
    insert into public.admin_audit_log (admin_id, action, target, detail)
    values (auth.uid(), 'box_plan', new.name, jsonb_build_object('box_id', new.id, 'from', old.plan, 'to', new.plan));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_log_box_plan on public.boxes;
create trigger trg_log_box_plan after update of plan on public.boxes for each row execute function public.log_box_plan();

-- ─── 9. Birth year: a range that doesn't expire ──────────────────────────────
alter table public.profiles drop constraint if exists profiles_birth_year_check;
alter table public.profiles add constraint profiles_birth_year_check check (birth_year is null or birth_year between 1920 and 2100);


-- ================================================================
-- Acceso al panel de administrador de la app (/admin)
-- Cambia TU_CORREO@ejemplo.com por el correo con el que entras a APEX.
-- ================================================================
insert into public.platform_admins (user_id)
select id from public.profiles where email = 'TU_CORREO@ejemplo.com'
on conflict do nothing;

commit;
