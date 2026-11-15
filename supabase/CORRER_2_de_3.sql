-- APEX — Parte 2 de 3. Córrelas en orden: 1, 2, 3.
-- Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Si algo falla no se aplica nada de esta parte; puedes reintentarla.

begin;

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


commit;
