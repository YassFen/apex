-- APEX — Parte 1 de 2 (actualización de noviembre). Córrelas en orden: 1 y luego 2.
-- Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Si algo falla no se aplica nada de esta parte; puedes reintentarla.

begin;

-- ================================================================
-- 014_progress.sql
-- ================================================================
-- 014 — Progress: experience (XP), leagues, streaks, squads (duplas / cuartetos) and app challenges.
--
-- How XP is earned (also explained in the app, /progress):
--   WOD of the day logged ........ 25   (once per WOD)
--   Class attended ............... 15   (once per booking marked "attended")
--   New personal record (RM) ..... 40   (up to 3 a day)
--   Other lift logged ............ 10   (up to 3 a day)
--   Benchmark logged ............. 20   (up to 2 a day)
--   Personal training log ......... 5   (once a day)
--   Squad trained together ....... 15   (each member, when every member trained that day)
--   Streak milestones ............ 30 / 70 / 150 / 300 / 600 / 1000 / 1500 / 2000  (3, 7, 14, 30, 60, 100, 200, 365 days)
--   Box competition .............. 1st 200, 2nd 120, 3rd 80, took part 40
--   App challenge completed ...... its own reward
-- A streak counts training days; one rest day in between does not break it, two in a row do.
-- Leagues come from total XP (worked out in the app): Bronce 0 · Plata 600 · Oro 1800 · Platino 4000 · Diamante 8000 · Élite 15000.
-- Every XP trigger swallows its own errors: logging a workout must never fail because of XP.

-- ─── 1. Visibility ──────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists league_public boolean not null default true;

-- ─── 2. XP ledger ───────────────────────────────────────────────────────────────
create table if not exists public.xp_events (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  kind        text not null check (kind in ('wod','class','pr','lift','benchmark','log','streak','squad','competition','challenge')),
  points      integer not null check (points between 0 and 2000),
  ref         text not null check (char_length(ref) <= 120),
  day         date not null default public.app_today(),
  created_at  timestamptz not null default now(),
  unique (user_id, kind, ref)
);
create index if not exists xp_events_user_day on public.xp_events (user_id, day desc);
create index if not exists xp_events_day on public.xp_events (day);
alter table public.xp_events enable row level security;
drop policy if exists "Own xp readable" on public.xp_events;
create policy "Own xp readable" on public.xp_events for select to authenticated using (user_id = auth.uid());
-- No insert/update/delete policies: only the functions below write XP.

-- Training kinds are the ones that count as "trained that day".
create or replace function public.xp_is_training(p_kind text) returns boolean
language sql immutable as $$ select p_kind in ('wod','class','pr','lift','benchmark','log') $$;

-- ─── 3. Streak of a list of days (one rest day allowed) ─────────────────────────
-- Returns the current streak (0 when broken), the best streak ever and the first day of the current run.
create or replace function public.streak_of_days(p_days date[], p_today date)
returns table (current_streak int, best_streak int, run_start date)
language plpgsql immutable as $$
declare d date; prev date; run int := 0; best int := 0; start date;
begin
  foreach d in array (select coalesce(array_agg(x order by x), '{}') from (select distinct unnest(p_days) x) s) loop
    if prev is null or d - prev > 2 then run := 1; start := d; else run := run + 1; end if;
    best := greatest(best, run); prev := d;
  end loop;
  if prev is null or p_today - prev > 2 then return query select 0, best, null::date;
  else return query select run, best, start; end if;
end;
$$;

create or replace function public.user_streak(p_user uuid)
returns table (current_streak int, best_streak int, run_start date)
language sql stable security definer set search_path = public as $$
  select * from public.streak_of_days(
    (select coalesce(array_agg(distinct day), '{}') from public.xp_events where user_id = p_user and public.xp_is_training(kind)),
    public.app_today())
$$;
revoke execute on function public.user_streak(uuid) from public, anon, authenticated;

-- ─── 4. Squads ──────────────────────────────────────────────────────────────────
create table if not exists public.squads (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(btrim(name)) between 1 and 40),
  size         integer not null check (size in (2, 4)),
  invite_code  text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  created_by   uuid not null references public.profiles(id) on delete cascade,
  created_at   timestamptz not null default now()
);
create table if not exists public.squad_members (
  squad_id   uuid not null references public.squads(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  primary key (squad_id, user_id)
);
create index if not exists squad_members_user on public.squad_members (user_id);
create table if not exists public.squad_days (
  squad_id  uuid not null references public.squads(id) on delete cascade,
  day       date not null,
  primary key (squad_id, day)
);
alter table public.squads enable row level security;
alter table public.squad_members enable row level security;
alter table public.squad_days enable row level security;

create or replace function public.is_squad_member(p_squad uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.squad_members where squad_id = p_squad and user_id = auth.uid())
$$;

drop policy if exists "Members read squad" on public.squads;
create policy "Members read squad" on public.squads for select to authenticated using (public.is_squad_member(id));
drop policy if exists "Members read squad members" on public.squad_members;
create policy "Members read squad members" on public.squad_members for select to authenticated using (public.is_squad_member(squad_id));
drop policy if exists "Members read squad days" on public.squad_days;
create policy "Members read squad days" on public.squad_days for select to authenticated using (public.is_squad_member(squad_id));
-- Writes go through create_squad / join_squad / leave_squad.

create or replace function public.create_squad(p_name text, p_size int)
returns json language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_code text;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  if p_size not in (2, 4) then return json_build_object('ok', false, 'reason', 'bad_size'); end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then return json_build_object('ok', false, 'reason', 'bad_name'); end if;
  if (select count(*) from public.squad_members where user_id = auth.uid()) >= 3 then
    return json_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.squads (name, size, created_by) values (btrim(p_name), p_size, auth.uid()) returning id, invite_code into v_id, v_code;
  insert into public.squad_members (squad_id, user_id) values (v_id, auth.uid());
  return json_build_object('ok', true, 'id', v_id, 'code', v_code);
end;
$$;

create or replace function public.join_squad(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare s public.squads;
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  select * into s from public.squads where invite_code = upper(btrim(coalesce(p_code, ''))) for update;
  if not found then return json_build_object('ok', false, 'reason', 'no_squad'); end if;
  if exists (select 1 from public.squad_members where squad_id = s.id and user_id = auth.uid()) then
    return json_build_object('ok', true, 'id', s.id, 'already', true);
  end if;
  if (select count(*) from public.squad_members where squad_id = s.id) >= s.size then
    return json_build_object('ok', false, 'reason', 'full');
  end if;
  if (select count(*) from public.squad_members where user_id = auth.uid()) >= 3 then
    return json_build_object('ok', false, 'reason', 'too_many');
  end if;
  insert into public.squad_members (squad_id, user_id) values (s.id, auth.uid());
  return json_build_object('ok', true, 'id', s.id);
end;
$$;

create or replace function public.leave_squad(p_squad uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  delete from public.squad_members where squad_id = p_squad and user_id = auth.uid();
  delete from public.squads s where s.id = p_squad and not exists (select 1 from public.squad_members m where m.squad_id = s.id);
  return json_build_object('ok', true);
end;
$$;

-- ─── 5. App challenges (for everybody, created by the app administrator) ────────
create table if not exists public.app_challenges (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  description  text check (description is null or char_length(description) <= 300),
  metric       text not null check (metric in ('days','wods','classes','prs','xp')),
  target       integer not null check (target between 1 and 100000),
  xp_reward    integer not null default 100 check (xp_reward between 0 and 2000),
  starts_on    date not null,
  ends_on      date not null,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  check (ends_on >= starts_on)
);
alter table public.app_challenges enable row level security;
drop policy if exists "Everyone reads app challenges" on public.app_challenges;
create policy "Everyone reads app challenges" on public.app_challenges for select to authenticated using (true);
drop policy if exists "Platform admin creates app challenges" on public.app_challenges;
create policy "Platform admin creates app challenges" on public.app_challenges for insert to authenticated with check (public.is_platform_admin());
drop policy if exists "Platform admin edits app challenges" on public.app_challenges;
create policy "Platform admin edits app challenges" on public.app_challenges for update to authenticated using (public.is_platform_admin()) with check (public.is_platform_admin());
drop policy if exists "Platform admin deletes app challenges" on public.app_challenges;
create policy "Platform admin deletes app challenges" on public.app_challenges for delete to authenticated using (public.is_platform_admin());

create or replace function public.challenge_progress(p_user uuid, p_metric text, p_from date, p_to date)
returns integer language sql stable security definer set search_path = public as $$
  select coalesce(case p_metric
    when 'days'    then (select count(distinct day) from public.xp_events where user_id = p_user and day between p_from and p_to and public.xp_is_training(kind))
    when 'wods'    then (select count(*) from public.xp_events where user_id = p_user and day between p_from and p_to and kind = 'wod')
    when 'classes' then (select count(*) from public.xp_events where user_id = p_user and day between p_from and p_to and kind = 'class')
    when 'prs'     then (select count(*) from public.xp_events where user_id = p_user and day between p_from and p_to and kind = 'pr')
    when 'xp'      then (select sum(points) from public.xp_events where user_id = p_user and day between p_from and p_to and kind <> 'challenge')
  end, 0)::int
$$;
revoke execute on function public.challenge_progress(uuid, text, date, date) from public, anon, authenticated;

-- ─── 6. Awarding XP (internal only) ─────────────────────────────────────────────
create or replace function public.award_xp(p_user uuid, p_kind text, p_points int, p_ref text, p_day date default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_day date := least(coalesce(p_day, public.app_today()), public.app_today());
  v_new boolean;
  v_cap int := case p_kind when 'pr' then 3 when 'lift' then 3 when 'benchmark' then 2 else null end;
  st record; m int; pts int; sq record; ch record;
begin
  if p_user is null then return false; end if;
  if v_cap is not null and (select count(*) from public.xp_events where user_id = p_user and kind = p_kind and day = v_day) >= v_cap then
    return false;
  end if;
  insert into public.xp_events (user_id, kind, points, ref, day) values (p_user, p_kind, p_points, p_ref, v_day)
    on conflict (user_id, kind, ref) do nothing;
  get diagnostics m = row_count; v_new := m > 0;
  if not v_new then return false; end if;

  if public.xp_is_training(p_kind) then
    -- Streak milestones (once per milestone per run)
    select * into st from public.user_streak(p_user);
    if st.current_streak > 0 then
      foreach m in array array[3, 7, 14, 30, 60, 100, 200, 365] loop
        exit when st.current_streak < m;
        pts := case m when 3 then 30 when 7 then 70 when 14 then 150 when 30 then 300 when 60 then 600 when 100 then 1000 when 200 then 1500 else 2000 end;
        insert into public.xp_events (user_id, kind, points, ref, day) values (p_user, 'streak', pts, 'streak:' || m || ':' || st.run_start, v_day)
          on conflict (user_id, kind, ref) do nothing;
      end loop;
    end if;
    -- Squads: every member trained that day → the squad keeps its streak and everybody earns 15
    for sq in
      select s.id, s.size from public.squads s join public.squad_members me on me.squad_id = s.id and me.user_id = p_user
    loop
      if (select count(*) from public.squad_members where squad_id = sq.id) = sq.size
         and not exists (select 1 from public.squad_days where squad_id = sq.id and day = v_day)
         and not exists (
           select 1 from public.squad_members sm where sm.squad_id = sq.id
             and not exists (select 1 from public.xp_events e where e.user_id = sm.user_id and e.day = v_day and public.xp_is_training(e.kind)))
      then
        insert into public.squad_days (squad_id, day) values (sq.id, v_day) on conflict do nothing;
        insert into public.xp_events (user_id, kind, points, ref, day)
          select sm.user_id, 'squad', 15, 'squad:' || sq.id || ':' || v_day, v_day from public.squad_members sm where sm.squad_id = sq.id
          on conflict (user_id, kind, ref) do nothing;
      end if;
    end loop;
  end if;

  -- App challenges reached with this XP
  if p_kind <> 'challenge' then
    for ch in select * from public.app_challenges where v_day between starts_on and ends_on loop
      if public.challenge_progress(p_user, ch.metric, ch.starts_on, ch.ends_on) >= ch.target then
        insert into public.xp_events (user_id, kind, points, ref, day) values (p_user, 'challenge', ch.xp_reward, 'challenge:' || ch.id, v_day)
          on conflict (user_id, kind, ref) do nothing;
      end if;
    end loop;
  end if;
  return true;
end;
$$;
revoke execute on function public.award_xp(uuid, text, int, text, date) from public, anon, authenticated;

-- ─── 7. Triggers that award XP ──────────────────────────────────────────────────
create or replace function public.xp_on_wod_result() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.award_xp(new.user_id, 'wod', 25, 'wod:' || new.daily_wod_id,
      (select scheduled_for from public.daily_wods where id = new.daily_wod_id));
  exception when others then null; end;
  return new;
end;
$$;
drop trigger if exists trg_xp_wod_result on public.wod_results;
create trigger trg_xp_wod_result after insert on public.wod_results for each row execute function public.xp_on_wod_result();

create or replace function public.xp_on_attendance() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'attended' then
    begin
      perform public.award_xp(new.user_id, 'class', 15, 'class:' || new.id, new.class_date);
    exception when others then null; end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_xp_attendance on public.class_bookings;
create trigger trg_xp_attendance after insert or update of status on public.class_bookings for each row execute function public.xp_on_attendance();

create or replace function public.xp_on_pr() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_best numeric; v_is_pr boolean;
begin
  begin
    select case when new.metric = 'time' then min(value_lb) else max(value_lb) end into v_best
      from public.pr_records where user_id = new.user_id and movement_id = new.movement_id and metric = new.metric and id <> new.id;
    v_is_pr := v_best is null or (case when new.metric = 'time' then new.value_lb < v_best else new.value_lb > v_best end);
    perform public.award_xp(new.user_id, case when v_is_pr then 'pr' else 'lift' end, case when v_is_pr then 40 else 10 end,
      'pr:' || new.id, (new.recorded_at at time zone 'America/Santiago')::date);
  exception when others then null; end;
  return new;
end;
$$;
drop trigger if exists trg_xp_pr on public.pr_records;
create trigger trg_xp_pr after insert on public.pr_records for each row execute function public.xp_on_pr();

create or replace function public.xp_on_benchmark() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.award_xp(new.user_id, 'benchmark', 20, 'bench:' || new.id, (new.recorded_at at time zone 'America/Santiago')::date);
  exception when others then null; end;
  return new;
end;
$$;
drop trigger if exists trg_xp_benchmark on public.benchmarks;
create trigger trg_xp_benchmark after insert on public.benchmarks for each row execute function public.xp_on_benchmark();

create or replace function public.xp_on_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  begin
    perform public.award_xp(new.user_id, 'log', 5, 'log:' || new.logged_on, new.logged_on);
  exception when others then null; end;
  return new;
end;
$$;
drop trigger if exists trg_xp_log on public.personal_logs;
create trigger trg_xp_log after insert on public.personal_logs for each row execute function public.xp_on_log();

-- Box competitions only (an event someone logs for themselves earns nothing).
create or replace function public.xp_on_competition() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_box uuid; v_day date; pts int;
begin
  if new.final_place is null then return new; end if;
  begin
    select box_id, coalesce(ends_on, starts_on) into v_box, v_day from public.events where id = new.event_id;
    if v_box is null then return new; end if;
    pts := case new.final_place when 1 then 200 when 2 then 120 when 3 then 80 else 40 end;
    delete from public.xp_events where user_id = new.user_id and kind = 'competition' and ref = 'comp:' || new.event_id;
    perform public.award_xp(new.user_id, 'competition', pts, 'comp:' || new.event_id, v_day);
  exception when others then null; end;
  return new;
end;
$$;
drop trigger if exists trg_xp_competition on public.event_participants;
create trigger trg_xp_competition after insert or update of final_place on public.event_participants for each row execute function public.xp_on_competition();

-- ─── 8. Reading progress ────────────────────────────────────────────────────────
-- Everything the progress screen needs in one round trip.
create or replace function public.my_progress()
returns json language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid(); v_today date := public.app_today();
  v_week date := date_trunc('week', public.app_today())::date;
  st record; v json;
begin
  if v_me is null then return null; end if;
  select * into st from public.user_streak(v_me);
  select json_build_object(
    'total', (select coalesce(sum(points), 0) from public.xp_events where user_id = v_me),
    'week', (select coalesce(sum(points), 0) from public.xp_events where user_id = v_me and day >= v_week),
    'today', (select coalesce(sum(points), 0) from public.xp_events where user_id = v_me and day = v_today),
    'trained_today', exists (select 1 from public.xp_events where user_id = v_me and day = v_today and public.xp_is_training(kind)),
    'streak', st.current_streak, 'best_streak', st.best_streak,
    'last_day', (select max(day) from public.xp_events where user_id = v_me and public.xp_is_training(kind)),
    'public', (select league_public from public.profiles where id = v_me),
    'recent', (select coalesce(json_agg(r order by r.created_at desc), '[]') from (
        select kind, points, day, created_at from public.xp_events where user_id = v_me order by created_at desc limit 20) r),
    'days', (select coalesce(json_agg(d order by d), '[]') from (
        select distinct day d from public.xp_events where user_id = v_me and public.xp_is_training(kind) and day > v_today - 35) x),
    'squads', (select coalesce(json_agg(json_build_object(
        'id', s.id, 'name', s.name, 'size', s.size, 'code', s.invite_code,
        'streak', (select current_streak from public.streak_of_days((select coalesce(array_agg(day), '{}') from public.squad_days where squad_id = s.id), v_today)),
        'best', (select best_streak from public.streak_of_days((select coalesce(array_agg(day), '{}') from public.squad_days where squad_id = s.id), v_today)),
        'members', (select json_agg(json_build_object(
            'id', p.id, 'name', p.full_name, 'avatar', p.avatar_url,
            'trained_today', exists (select 1 from public.xp_events e where e.user_id = p.id and e.day = v_today and public.xp_is_training(e.kind)))
            order by sm.joined_at)
          from public.squad_members sm join public.profiles p on p.id = sm.user_id where sm.squad_id = s.id)
      ) order by s.created_at), '[]')
      from public.squads s join public.squad_members me on me.squad_id = s.id and me.user_id = v_me),
    'challenges', (select coalesce(json_agg(json_build_object(
        'id', c.id, 'title', c.title, 'description', c.description, 'metric', c.metric, 'target', c.target,
        'reward', c.xp_reward, 'starts_on', c.starts_on, 'ends_on', c.ends_on,
        'progress', public.challenge_progress(v_me, c.metric, c.starts_on, c.ends_on),
        'done', exists (select 1 from public.xp_events e where e.user_id = v_me and e.kind = 'challenge' and e.ref = 'challenge:' || c.id))
      order by c.ends_on), '[]')
      from public.app_challenges c where c.ends_on >= v_today - 7 and c.starts_on <= v_today + 7)
  ) into v;
  return v;
end;
$$;

-- Rankings: only people who left their league public (plus yourself).
-- p_scope: 'box' (p_id = box), 'squad' (p_id = squad) or 'global'. p_period: 'week' or 'all'.
create or replace function public.xp_ranking(p_scope text, p_id uuid default null, p_period text default 'week')
returns table (user_id uuid, full_name text, avatar_url text, xp bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_from date := case when p_period = 'week' then date_trunc('week', public.app_today())::date else date '2000-01-01' end;
begin
  if v_me is null then return; end if;
  if p_scope = 'box' and not (public.is_box_member(p_id) or public.is_box_coach(p_id)) then return; end if;
  if p_scope = 'squad' and not public.is_squad_member(p_id) then return; end if;
  return query
    with people as (
      select p.id from public.profiles p
      where (p.league_public or p.id = v_me)
        and case p_scope
          when 'box' then exists (select 1 from public.box_members bm where bm.box_id = p_id and bm.user_id = p.id and bm.is_active)
                          or exists (select 1 from public.boxes b where b.id = p_id and b.owner_id = p.id)
          when 'squad' then exists (select 1 from public.squad_members sm where sm.squad_id = p_id and sm.user_id = p.id)
          else true end
    )
    select p.id, p.full_name, p.avatar_url,
      coalesce(sum(e.points) filter (where e.day >= v_from), 0)::bigint,
      coalesce(sum(e.points), 0)::bigint
    from people x join public.profiles p on p.id = x.id
    left join public.xp_events e on e.user_id = p.id
    group by p.id, p.full_name, p.avatar_url
    having p.id = v_me or coalesce(sum(e.points) filter (where e.day >= v_from), 0) > 0
    order by 4 desc, 5 desc
    limit 50;
end;
$$;

-- Public profile: league of someone who left it public.
create or replace function public.public_xp(p_user uuid)
returns bigint language sql stable security definer set search_path = public as $$
  select case when (select league_public and profile_public from public.profiles where id = p_user)
    then (select coalesce(sum(points), 0) from public.xp_events where user_id = p_user) end
$$;
grant execute on function public.public_xp(uuid) to anon, authenticated;

-- ─── 9. Past activity counts (once) ─────────────────────────────────────────────
insert into public.xp_events (user_id, kind, points, ref, day)
  select r.user_id, 'wod', 25, 'wod:' || r.daily_wod_id, least(w.scheduled_for, public.app_today())
  from public.wod_results r join public.daily_wods w on w.id = r.daily_wod_id
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, points, ref, day)
  select user_id, case when is_pr then 'pr' else 'lift' end, case when is_pr then 40 else 10 end, 'pr:' || id,
         least((recorded_at at time zone 'America/Santiago')::date, public.app_today())
  from public.pr_records
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, points, ref, day)
  select user_id, 'class', 15, 'class:' || id, least(class_date, public.app_today()) from public.class_bookings where status = 'attended'
  on conflict (user_id, kind, ref) do nothing;
insert into public.xp_events (user_id, kind, points, ref, day)
  select user_id, 'benchmark', 20, 'bench:' || id, least((recorded_at at time zone 'America/Santiago')::date, public.app_today()) from public.benchmarks
  on conflict (user_id, kind, ref) do nothing;

-- A first challenge so the screen isn't empty.
insert into public.app_challenges (title, description, metric, target, xp_reward, starts_on, ends_on)
select 'Semana constante', 'Entrena 4 días esta semana.', 'days', 4, 100,
       date_trunc('week', public.app_today())::date, (date_trunc('week', public.app_today()) + interval '6 days')::date
where not exists (select 1 from public.app_challenges);


-- ================================================================
-- 015_one_wod_per_day.sql
-- ================================================================
-- 015: un solo WOD por box y por día (el mismo para todas las clases).
-- Idempotente: se puede correr varias veces. La columna class_time se conserva, pero ya no se usa.

do $$
begin
  -- Para cada (box, día) con varios WODs, elegimos el que tiene más resultados
  -- (empate: el publicado más tarde) y movemos a él los resultados de los demás.
  create temp table _wod_rank on commit drop as
    select d.id, d.box_id, d.scheduled_for,
           row_number() over (
             partition by d.box_id, d.scheduled_for
             order by (select count(*) from public.wod_results r where r.daily_wod_id = d.id) desc,
                      d.published_at desc nulls last, d.id
           ) as rn
    from public.daily_wods d;

  create temp table _wod_keep on commit drop as
    select k.id as keep_id, o.id as old_id
    from _wod_rank k
    join _wod_rank o on o.box_id = k.box_id and o.scheduled_for = k.scheduled_for and o.rn > 1
    where k.rn = 1;

  -- Resultados de atletas que aún no tienen resultado en el WOD que se queda.
  update public.wod_results r
     set daily_wod_id = k.keep_id
    from _wod_keep k
   where r.daily_wod_id = k.old_id
     and not exists (select 1 from public.wod_results x where x.daily_wod_id = k.keep_id and x.user_id = r.user_id)
     -- With 3+ WODs the same day an athlete may have several: move only their latest one.
     and r.id = (select r2.id from public.wod_results r2 join _wod_keep k2 on k2.old_id = r2.daily_wod_id
                  where k2.keep_id = k.keep_id and r2.user_id = r.user_id order by r2.recorded_at desc, r2.id limit 1);

  -- Los resultados que no se pudieron mover se borran junto con sus reacciones (cascade).
  delete from public.daily_wods d using _wod_keep k where d.id = k.old_id;

  update public.daily_wods set class_time = null where class_time is not null;
end $$;

create unique index if not exists daily_wods_box_day on public.daily_wods (box_id, scheduled_for);



commit;
