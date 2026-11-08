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
