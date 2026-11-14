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
