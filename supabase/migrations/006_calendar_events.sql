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
