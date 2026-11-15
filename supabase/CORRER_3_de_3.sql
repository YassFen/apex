-- APEX — Parte 3 de 3. Córrelas en orden: 1, 2, 3.
-- Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Si algo falla no se aplica nada de esta parte; puedes reintentarla.

begin;

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


-- Acceso al panel de administrador de la app (/admin)
insert into public.platform_admins (user_id)
select id from public.profiles where email = 'TU_CORREO@ejemplo.com'
on conflict do nothing;

commit;
