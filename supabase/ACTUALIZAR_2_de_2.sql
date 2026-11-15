-- APEX — Parte 2 de 2 (actualización de noviembre). Córrelas en orden: 1 y luego 2.
-- Supabase → SQL Editor → New query → pega TODO este archivo → Run.
-- Si algo falla no se aplica nada de esta parte; puedes reintentarla.

begin;

-- ================================================================
-- 016_admin_fixes.sql
-- ================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- 016 · Box administrator fixes: attendance totals computed in the database, freezing
--       with a renewal already loaded, slots that change day or capacity, removed
--       members, cancelled plans, past classes and coach walk-ins.
-- Safe to run more than once and inside a transaction. Run after 010 and 013.
-- The app keeps working before this runs (it falls back to the old queries).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Helpers ───────────────────────────────────────────────────────────────────
-- True when a class (date + start time, Santiago) has already started.
create or replace function public.class_started(p_date date, p_start time)
returns boolean language sql stable set search_path = public as $$
  select p_date < public.app_today()
      or (p_date = public.app_today() and p_start <= (now() at time zone 'America/Santiago')::time);
$$;

-- When a weekly slot was switched off (the grid keeps showing what was given before).
alter table public.class_slots add column if not exists removed_at timestamptz;

-- ─── 1. Attendance per person, computed in the database ──────────────────────
-- Returns { "<user_id>": ["YYYY-MM-DD", …] }: one value, so the 1000-row API limit never cuts it.
create or replace function public.box_attendance(p_box uuid, p_from date, p_to date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := public.app_today();
  v_out   jsonb;
begin
  if auth.uid() is null or p_box is null or not public.is_box_admin(p_box) then raise exception 'not_allowed'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 800 then raise exception 'bad_range'; end if;
  select coalesce(jsonb_object_agg(x.user_id, x.days), '{}'::jsonb) into v_out
  from (
    select d.user_id, jsonb_agg(to_char(d.day, 'YYYY-MM-DD') order by d.day) as days
    from (
      select b.user_id, b.class_date as day from public.class_bookings b
       where b.box_id = p_box and b.class_date between p_from and p_to
         and (b.status = 'attended' or (b.status = 'booked' and b.class_date < v_today))
      union
      select r.user_id, w.scheduled_for from public.wod_results r
        join public.daily_wods w on w.id = r.daily_wod_id
       where w.box_id = p_box and w.scheduled_for between p_from and p_to
    ) d
    group by d.user_id
  ) x;
  return v_out;
end;
$$;
revoke all on function public.box_attendance(uuid, date, date) from public, anon;
grant execute on function public.box_attendance(uuid, date, date) to authenticated;

-- ─── 2. Freezing pauses every plan of the person, and reactivating moves renewals ─
-- A frozen plan blocks bookings even when a renewal loaded later has already started.
create or replace function public.booking_block(p_box uuid, p_user uuid, p_date date)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_m public.memberships%rowtype;
begin
  if exists (select 1 from public.memberships
             where box_id = p_box and user_id = p_user and status = 'frozen'
               and starts_on <= p_date and coalesce(frozen_on, p_date) <= p_date) then
    return 'frozen';
  end if;
  select * into v_m from public.membership_on(p_box, p_user, p_date);
  if v_m.id is null then
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

-- Reactivates a frozen plan: the frozen days go back to its end date, and every plan of
-- that person loaded after it (a renewal) moves forward by the same days.
create or replace function public.unfreeze_membership(p_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_m     public.memberships%rowtype;
  v_today date := public.app_today();
  v_days  int;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_m from public.memberships where id = p_id for update;
  if not found or not public.is_box_admin(v_m.box_id) then raise exception 'not_allowed'; end if;
  if v_m.status <> 'frozen' then return json_build_object('ok', false, 'reason', 'not_frozen'); end if;
  v_days := greatest(0, v_today - coalesce(v_m.frozen_on, v_today));

  update public.memberships set status = 'active', frozen_on = null, ends_on = ends_on + v_days where id = v_m.id;
  if v_days > 0 then
    update public.memberships
       set starts_on = starts_on + v_days, ends_on = ends_on + v_days
     where box_id = v_m.box_id and user_id = v_m.user_id and id <> v_m.id
       and status <> 'cancelled' and starts_on > v_m.starts_on;
  end if;
  insert into public.membership_events (membership_id, box_id, user_id, type, happened_on, days, created_by)
  values (v_m.id, v_m.box_id, v_m.user_id, 'reactivated', v_today, v_days, auth.uid());
  return json_build_object('ok', true, 'days', v_days, 'ends_on', v_m.ends_on + v_days);
end;
$$;
revoke all on function public.unfreeze_membership(uuid) from public, anon;
grant execute on function public.unfreeze_membership(uuid) to authenticated;

-- ─── Waiting list: fills every free spot, only with active members with a valid plan ─
create or replace function public.promote_waitlist(p_slot uuid, p_date date)
returns void language plpgsql security definer set search_path = public as $$
declare
  r       public.class_bookings%rowtype;
  v_slot  public.class_slots%rowtype;
  v_ov    public.class_overrides%rowtype;
  v_cap   int;
  v_taken int;
begin
  select * into v_slot from public.class_slots where id = p_slot;
  if not found or not v_slot.is_active then return; end if;
  if public.class_started(p_date, v_slot.start_time) then return; end if;
  select * into v_ov from public.class_overrides where slot_id = p_slot and box_id = v_slot.box_id and class_date = p_date;
  if coalesce(v_ov.cancelled, false) then return; end if;
  v_cap := coalesce(v_ov.capacity, v_slot.capacity);
  select count(*) into v_taken from public.class_bookings
   where slot_id = p_slot and class_date = p_date and status in ('booked', 'attended', 'no_show');
  for r in select * from public.class_bookings
            where slot_id = p_slot and class_date = p_date and status = 'waitlist' order by created_at loop
    exit when v_taken >= v_cap;
    if exists (select 1 from public.box_members where box_id = r.box_id and user_id = r.user_id and is_active)
       and public.booking_block(r.box_id, r.user_id, p_date) is null then
      update public.class_bookings set status = 'booked' where id = r.id;
      perform public.spend_class(r.box_id, r.user_id, p_date, 1);
      v_taken := v_taken + 1;
    end if;
  end loop;
end;
$$;
revoke all on function public.promote_waitlist(uuid, date) from public, anon, authenticated;

-- Cancels the bookings of a slot that haven't happened yet and gives the classes back.
-- p_user limits it to one person (null = everyone). Internal only.
create or replace function public.release_future_bookings(p_slot uuid, p_start time, p_user uuid default null, p_promote boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare r public.class_bookings%rowtype;
begin
  for r in select * from public.class_bookings
            where slot_id = p_slot and status in ('booked', 'waitlist')
              and (p_user is null or user_id = p_user)
              and not public.class_started(class_date, p_start)
            order by class_date loop
    update public.class_bookings set status = 'cancelled' where id = r.id;
    if r.status = 'booked' then
      perform public.spend_class(r.box_id, r.user_id, r.class_date, -1);
      if p_promote then perform public.promote_waitlist(r.slot_id, r.class_date); end if;
    end if;
  end loop;
end;
$$;
revoke all on function public.release_future_bookings(uuid, time, uuid, boolean) from public, anon, authenticated;

-- ─── 3 + 6. Slots: switched off or moved to another day ───────────────────────
-- Stamps when a slot was switched off (so today's earlier class stays on the grid).
create or replace function public.stamp_slot_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_active and not new.is_active then new.removed_at := now();
  elsif not old.is_active and new.is_active then new.removed_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_stamp_slot_removed on public.class_slots;
create trigger trg_stamp_slot_removed before update of is_active on public.class_slots
  for each row execute function public.stamp_slot_removed();

-- Switching a slot off cancels only the classes that haven't started (a class given this
-- morning keeps its attendance).
create or replace function public.on_slot_removed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.is_active and not new.is_active then
    perform public.release_future_bookings(new.id, old.start_time);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_on_slot_removed on public.class_slots;
create trigger trg_on_slot_removed after update of is_active on public.class_slots
  for each row execute function public.on_slot_removed();

-- A slot moved to another weekday: its upcoming bookings were for the old day.
create or replace function public.on_slot_moved()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.weekday is distinct from old.weekday then
    perform public.release_future_bookings(new.id, old.start_time);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_on_slot_moved on public.class_slots;
create trigger trg_on_slot_moved after update of weekday on public.class_slots
  for each row execute function public.on_slot_moved();

-- ─── 5. More spots: the waiting list moves up ───────────────────────────────
create or replace function public.on_slot_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare d date;
begin
  if new.is_active and new.capacity > old.capacity then
    for d in select distinct b.class_date from public.class_bookings b
              where b.slot_id = new.id and b.status = 'waitlist' and b.class_date >= public.app_today()
                and not exists (select 1 from public.class_overrides o
                                where o.slot_id = new.id and o.class_date = b.class_date and o.capacity is not null) loop
      perform public.promote_waitlist(new.id, d);
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_on_slot_capacity on public.class_slots;
create trigger trg_on_slot_capacity after update of capacity on public.class_slots
  for each row execute function public.on_slot_capacity();

create or replace function public.on_override_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_base int; v_before int;
begin
  if new.cancelled or new.capacity is null then return new; end if;
  select capacity into v_base from public.class_slots where id = new.slot_id and box_id = new.box_id;
  if v_base is null then return new; end if;
  v_before := case when tg_op = 'INSERT' then v_base else coalesce(old.capacity, v_base) end;
  if new.capacity > v_before then perform public.promote_waitlist(new.slot_id, new.class_date); end if;
  return new;
end;
$$;
drop trigger if exists trg_on_override_capacity on public.class_overrides;
create trigger trg_on_override_capacity after insert or update of capacity on public.class_overrides
  for each row execute function public.on_override_capacity();

-- ─── 6. A class that already started can't be cancelled (it would erase attendance) ─
create or replace function public.on_class_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  r      public.class_bookings%rowtype;
  v_slot public.class_slots%rowtype;
begin
  if new.cancelled and (tg_op = 'INSERT' or not coalesce(old.cancelled, false)) then
    select * into v_slot from public.class_slots where id = new.slot_id and box_id = new.box_id;
    if not found then return new; end if;
    if public.class_started(new.class_date, v_slot.start_time) then
      raise exception 'Esa clase ya empezó, así que no se puede cancelar.';
    end if;
    for r in select * from public.class_bookings
              where slot_id = new.slot_id and class_date = new.class_date and status in ('booked', 'waitlist') loop
      update public.class_bookings set status = 'cancelled' where id = r.id;
      if r.status = 'booked' then perform public.spend_class(r.box_id, r.user_id, r.class_date, -1); end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_on_class_cancelled on public.class_overrides;
create trigger trg_on_class_cancelled after insert or update of cancelled on public.class_overrides
  for each row execute function public.on_class_cancelled();

-- ─── 4. Someone removed from the box frees their upcoming spots ──────────────
create or replace function public.on_member_removed()
returns trigger language plpgsql security definer set search_path = public as $$
declare s record;
begin
  if (tg_op = 'DELETE' and old.is_active) or (tg_op = 'UPDATE' and old.is_active and not new.is_active) then
    for s in select distinct sl.id, sl.start_time from public.class_bookings b
               join public.class_slots sl on sl.id = b.slot_id and sl.box_id = old.box_id
              where b.box_id = old.box_id and b.user_id = old.user_id and b.status in ('booked', 'waitlist')
                and b.class_date >= public.app_today() loop
      perform public.release_future_bookings(s.id, s.start_time, old.user_id, true);
    end loop;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
drop trigger if exists trg_on_member_removed on public.box_members;
create trigger trg_on_member_removed after update of is_active or delete on public.box_members
  for each row execute function public.on_member_removed();

-- A cancelled plan frees the upcoming bookings that no other plan covers.
create or replace function public.on_membership_cancelled()
returns trigger language plpgsql security definer set search_path = public as $$
declare r record;
begin
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    for r in select b.id, b.slot_id, b.class_date, b.status from public.class_bookings b
               join public.class_slots sl on sl.id = b.slot_id and sl.box_id = new.box_id
              where b.box_id = new.box_id and b.user_id = new.user_id and b.status in ('booked', 'waitlist')
                and not public.class_started(b.class_date, sl.start_time)
                and public.booking_block(new.box_id, new.user_id, b.class_date) is not null loop
      update public.class_bookings set status = 'cancelled' where id = r.id;
      if r.status = 'booked' then perform public.promote_waitlist(r.slot_id, r.class_date); end if;
    end loop;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_on_membership_cancelled on public.memberships;
create trigger trg_on_membership_cancelled after update of status on public.memberships
  for each row execute function public.on_membership_cancelled();

-- ─── 10. Coach walk-ins: staff add someone regardless of plan or capacity ────
create or replace function public.book_class(p_slot uuid, p_date date, p_user uuid default null)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := coalesce(p_user, auth.uid());
  v_slot   public.class_slots%rowtype;
  v_ov     public.class_overrides%rowtype;
  v_staff  boolean;
  v_walkin boolean;
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
  -- A coach or the administrator adding another person (walk-in).
  v_walkin := v_staff and v_uid <> auth.uid();
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
  if v_prev in ('booked', 'attended') then return json_build_object('ok', true, 'status', v_prev); end if;
  if v_prev = 'waitlist' and not v_walkin then return json_build_object('ok', true, 'status', v_prev); end if;
  if v_prev = 'no_show' and not v_staff then return json_build_object('ok', true, 'status', v_prev); end if;

  v_block := public.booking_block(v_slot.box_id, v_uid, p_date);
  if v_block is not null and not v_walkin then return json_build_object('ok', false, 'reason', v_block); end if;

  if v_walkin then
    -- The person is in the room: they take the spot even over capacity.
    v_status := 'booked';
  else
    select count(*) into v_taken from public.class_bookings
      where slot_id = p_slot and class_date = p_date and status in ('booked', 'attended', 'no_show');
    v_status := case when v_taken >= v_cap then 'waitlist' else 'booked' end;
  end if;

  insert into public.class_bookings (slot_id, box_id, class_date, user_id, status)
  values (p_slot, v_slot.box_id, p_date, v_uid, v_status)
  on conflict (slot_id, class_date, user_id) do update set status = excluded.status, created_at = now();
  -- A class is used only from a plan that is in force and has classes left.
  if v_status = 'booked' and v_block is null and coalesce(v_prev, '') <> 'no_show' then
    perform public.spend_class(v_slot.box_id, v_uid, p_date, 1);
  end if;
  return json_build_object('ok', true, 'status', v_status);
end;
$$;
revoke all on function public.book_class(uuid, date, uuid) from public, anon;
grant execute on function public.book_class(uuid, date, uuid) to authenticated;


-- ================================================================
-- 017_athlete_fixes.sql
-- ================================================================
-- ═══════════════════════════════════════════════════════════════════════════════
-- 017 · Athlete-side fixes: box movement names, staff-entered competition results,
--       WOD result edit counter, PR flag, write-policy holes and fixes for 014.
-- Safe to run more than once and inside one transaction. Run after 001–016 (needs 014).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Movements: names unique per box, globals unique among globals ──────────
-- The old constraint made every name unique across all boxes, so box B couldn't add
-- "Devil Press" if box A (private to A) already had it.
-- Rows that would collide case-insensitively in the same scope get a " (n)" suffix first.
do $$
declare r record;
begin
  for r in
    select id, name, rn from (
      select id, name, row_number() over (partition by box_id, lower(name) order by id) as rn
      from public.movements
    ) t where rn > 1
  loop
    update public.movements set name = left(r.name, 74) || ' (' || r.rn || ')' where id = r.id;
  end loop;
end $$;

alter table public.movements drop constraint if exists movements_name_key;
drop index if exists public.movements_name_key;
create unique index if not exists movements_global_name_uq on public.movements (lower(name)) where box_id is null;
create unique index if not exists movements_box_name_uq on public.movements (box_id, lower(name)) where box_id is not null;

-- ─── 2. Box competitions: coaches/admins enter results for their athletes ──────
-- True when the current user is a coach or administrator of the event's box (box events only).
create or replace function public.is_event_staff(p_event uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.events e
    where e.id = p_event and e.box_id is not null
      and (public.is_box_coach(e.box_id) or public.is_box_admin(e.box_id)));
$$;

-- Staff of the event's box, and p_user is signed up for it.
create or replace function public.event_staff_has_participant(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_event_staff(p_event) and exists (
    select 1 from public.event_participants ep where ep.event_id = p_event and ep.user_id = p_user);
$$;

-- Staff of the event's box, and p_user is an active member of that box.
create or replace function public.event_staff_has_member(p_event uuid, p_user uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_event_staff(p_event) and exists (
    select 1 from public.events e join public.box_members bm on bm.box_id = e.box_id
    where e.id = p_event and bm.user_id = p_user and bm.is_active);
$$;

revoke all on function public.is_event_staff(uuid) from public, anon;
revoke all on function public.event_staff_has_participant(uuid, uuid) from public, anon;
revoke all on function public.event_staff_has_member(uuid, uuid) from public, anon;
grant execute on function public.is_event_staff(uuid) to authenticated;
grant execute on function public.event_staff_has_participant(uuid, uuid) to authenticated;
grant execute on function public.event_staff_has_member(uuid, uuid) to authenticated;

-- A result always belongs to the event of its workout (before, event_id was free text-like:
-- a result could point at a workout of one event and an event the person could see).
update public.event_results r set event_id = w.event_id
  from public.event_workouts w
 where w.id = r.workout_id and r.event_id is distinct from w.event_id;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'event_workouts_id_event') then
    alter table public.event_workouts add constraint event_workouts_id_event unique (id, event_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'event_results_workout_event') then
    alter table public.event_results add constraint event_results_workout_event
      foreign key (workout_id, event_id) references public.event_workouts (id, event_id)
      on update cascade on delete cascade;
  end if;
end $$;

-- event_results: staff read, enter, correct and delete results of the participants of their box event.
drop policy if exists "Staff see box event results" on public.event_results;
create policy "Staff see box event results" on public.event_results for select to authenticated
  using (public.is_event_staff(event_id));
drop policy if exists "Staff log box event results" on public.event_results;
create policy "Staff log box event results" on public.event_results for insert to authenticated
  with check (public.event_staff_has_participant(event_id, user_id));
drop policy if exists "Staff edit box event results" on public.event_results;
create policy "Staff edit box event results" on public.event_results for update to authenticated
  using (public.is_event_staff(event_id))
  with check (public.event_staff_has_participant(event_id, user_id));
drop policy if exists "Staff delete box event results" on public.event_results;
create policy "Staff delete box event results" on public.event_results for delete to authenticated
  using (public.is_event_staff(event_id));

-- Own results: explicit with check (same as before; the row stays yours).
drop policy if exists "Edit own event results" on public.event_results;
create policy "Edit own event results" on public.event_results for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A result can't be moved to another person or workout from the app (event_id follows the
-- workout through the foreign key; the cascade from event_workouts runs at depth > 1).
create or replace function public.guard_event_result_row()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and pg_trigger_depth() = 1
     and (new.workout_id is distinct from old.workout_id or new.user_id is distinct from old.user_id) then
    raise exception 'No puedes mover este resultado';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_event_result_row on public.event_results;
create trigger trg_guard_event_result_row before update on public.event_results
  for each row execute function public.guard_event_result_row();

-- event_participants: staff see everyone, sign up active members, and set place/field/category/division.
drop policy if exists "Staff see box event participants" on public.event_participants;
create policy "Staff see box event participants" on public.event_participants for select to authenticated
  using (public.is_event_staff(event_id));
drop policy if exists "Staff sign up box members" on public.event_participants;
create policy "Staff sign up box members" on public.event_participants for insert to authenticated
  with check (public.event_staff_has_member(event_id, user_id));
drop policy if exists "Staff edit box event participants" on public.event_participants;
create policy "Staff edit box event participants" on public.event_participants for update to authenticated
  using (public.is_event_staff(event_id)) with check (public.is_event_staff(event_id));

drop policy if exists "Update own participation" on public.event_participants;
create policy "Update own participation" on public.event_participants for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Nobody moves a sign-up to another event or person (before, the owner could change event_id
-- to any event, even one they can't see). Only place, field size, category and division change.
create or replace function public.guard_event_participant_row()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null
     and (new.event_id is distinct from old.event_id or new.user_id is distinct from old.user_id
          or new.created_at is distinct from old.created_at) then
    raise exception 'No puedes mover esta inscripción';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_event_participant_row on public.event_participants;
create trigger trg_guard_event_participant_row before update on public.event_participants
  for each row execute function public.guard_event_participant_row();

-- ─── 3. WOD results: the edit counter only goes up, one step per change ─────────
-- From the app (auth.uid() set): a new result starts at 0 edits and gets the server time; an
-- update can't move the result to another WOD/person or change recorded_at (ties on the
-- leaderboard); changing the result itself (type, value, Rx level) always counts one edit,
-- and any other update can raise the counter by at most 1 and never lower it.
-- Service and definer contexts (auth.uid() null) are not touched.
create or replace function public.guard_wod_result_row()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if tg_op = 'INSERT' then
    new.edit_count := 0;
    new.recorded_at := now();
    return new;
  end if;
  if new.daily_wod_id is distinct from old.daily_wod_id or new.user_id is distinct from old.user_id then
    raise exception 'No puedes mover este resultado';
  end if;
  new.recorded_at := old.recorded_at;
  if (new.result_type, new.result_value, new.rx_level) is distinct from (old.result_type, old.result_value, old.rx_level) then
    new.edit_count := old.edit_count + 1;
  else
    new.edit_count := greatest(old.edit_count, least(coalesce(new.edit_count, old.edit_count), old.edit_count + 1));
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_wod_result_row on public.wod_results;
create trigger trg_guard_wod_result_row before insert or update on public.wod_results
  for each row execute function public.guard_wod_result_row();

-- A result can only be logged on a WOD the person can see (live, its day has come or shown
-- early, in one of their boxes). Before, any daily_wod_id was accepted.
drop policy if exists "Athletes insert own results" on public.wod_results;
create policy "Athletes insert own results" on public.wod_results for insert
  with check (auth.uid() = user_id
              and exists (select 1 from public.daily_wods dw where dw.id = wod_results.daily_wod_id));

-- ─── 4. PRs: is_pr is computed by the database, never written by the app ────────
-- recalc_pr (AFTER trigger, only at depth 0, see 004) rewrites is_pr through
-- recalc_pr_for(); those nested updates run at pg_trigger_depth() = 2 and pass through.
-- A client statement fires this trigger at depth 1: an insert starts as false (recalc then
-- marks the best one) and an update keeps the stored flag.
create or replace function public.guard_pr_flag()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is null or pg_trigger_depth() > 1 then return new; end if;
  if tg_op = 'INSERT' then new.is_pr := false; else new.is_pr := old.is_pr; end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_pr_flag on public.pr_records;
create trigger trg_guard_pr_flag before insert or update on public.pr_records
  for each row execute function public.guard_pr_flag();

-- Undo any flag that was set by hand before this migration.
do $$
declare r record;
begin
  for r in select distinct user_id, movement_id, metric from public.pr_records loop
    perform public.recalc_pr_for(r.user_id, r.movement_id, r.metric);
  end loop;
end $$;

-- A PR can only be logged on a movement the person can see (global or of one of their boxes).
drop policy if exists "Own PRs insertable" on public.pr_records;
create policy "Own PRs insertable" on public.pr_records for insert
  with check (auth.uid() = user_id
              and exists (select 1 from public.movements m where m.id = pr_records.movement_id));

-- ─── 5. Support tickets: the box attached must be one of the sender's ──────────
create or replace function public.guard_ticket_box()
returns trigger language plpgsql set search_path = public as $$
begin
  if auth.uid() is not null and new.box_id is not null
     and not (public.is_box_member(new.box_id) or public.is_box_coach(new.box_id)) then
    new.box_id := null;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_guard_ticket_box on public.support_tickets;
create trigger trg_guard_ticket_box before insert on public.support_tickets
  for each row execute function public.guard_ticket_box();

-- ═══════════════════════════════════════════════════════════════════════════════
-- 6. Fixes for 014 (progress / XP)
-- ═══════════════════════════════════════════════════════════════════════════════

-- 6a. award_xp: records the person dates themselves (WOD results, lifts, benchmarks, logs)
--     only earn XP within the last 7 days, so back-dating rows can't farm XP or fake streaks.
--     Competition XP: at most 3 awards in any 7 days (limits a colluding box owner).
create or replace function public.award_xp(p_user uuid, p_kind text, p_points int, p_ref text, p_day date default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_today date := public.app_today();
  v_day date := least(coalesce(p_day, public.app_today()), public.app_today());
  v_new boolean;
  v_cap int := case p_kind when 'pr' then 3 when 'lift' then 3 when 'benchmark' then 2 else null end;
  st record; m int; pts int; sq record; ch record;
begin
  if p_user is null then return false; end if;
  if p_kind in ('wod', 'pr', 'lift', 'benchmark', 'log') and v_day < v_today - 7 then return false; end if;
  if p_kind = 'competition' and (select count(*) from public.xp_events
       where user_id = p_user and kind = 'competition' and created_at > now() - interval '7 days') >= 3 then
    return false;
  end if;
  if v_cap is not null and (select count(*) from public.xp_events where user_id = p_user and kind = p_kind and day = v_day) >= v_cap then
    return false;
  end if;
  insert into public.xp_events (user_id, kind, points, ref, day) values (p_user, p_kind, p_points, p_ref, v_day)
    on conflict (user_id, kind, ref) do nothing;
  get diagnostics m = row_count; v_new := m > 0;
  if not v_new then return false; end if;

  if public.xp_is_training(p_kind) then
    select * into st from public.user_streak(p_user);
    if st.current_streak > 0 then
      foreach m in array array[3, 7, 14, 30, 60, 100, 200, 365] loop
        exit when st.current_streak < m;
        pts := case m when 3 then 30 when 7 then 70 when 14 then 150 when 30 then 300 when 60 then 600 when 100 then 1000 when 200 then 1500 else 2000 end;
        insert into public.xp_events (user_id, kind, points, ref, day) values (p_user, 'streak', pts, 'streak:' || m || ':' || st.run_start, v_day)
          on conflict (user_id, kind, ref) do nothing;
      end loop;
    end if;
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
revoke all on function public.award_xp(uuid, text, int, text, date) from public, anon, authenticated;
revoke all on function public.user_streak(uuid) from public, anon, authenticated;
revoke all on function public.challenge_progress(uuid, text, date, date) from public, anon, authenticated;

-- 6b. Competition XP: an athlete could type final_place = 1 on any box event and get 200 XP.
--     A place set by the person themselves earns only the 40 for taking part; podium points
--     come when a coach/admin of the box sets the place (which replaces the earlier award).
create or replace function public.xp_on_competition() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_box uuid; v_day date; pts int; v_staff boolean;
begin
  if new.final_place is null then return new; end if;
  begin
    select box_id, coalesce(ends_on, starts_on) into v_box, v_day from public.events where id = new.event_id;
    if v_box is null then return new; end if;
    v_staff := auth.uid() is null
               or (auth.uid() <> new.user_id and (public.is_box_coach(v_box) or public.is_box_admin(v_box)));
    if v_staff then
      pts := case new.final_place when 1 then 200 when 2 then 120 when 3 then 80 else 40 end;
      delete from public.xp_events where user_id = new.user_id and kind = 'competition' and ref = 'comp:' || new.event_id;
      perform public.award_xp(new.user_id, 'competition', pts, 'comp:' || new.event_id, v_day);
    else
      perform public.award_xp(new.user_id, 'competition', 40, 'comp:' || new.event_id, v_day);
    end if;
  exception when others then null; end;
  return new;
end;
$$;

-- 6c. Global ranking: names and photos of people from other boxes only when their profile is
--     public too (league_public defaults to true, so before everybody was listed). Bad scopes
--     return nothing.
create or replace function public.xp_ranking(p_scope text, p_id uuid default null, p_period text default 'week')
returns table (user_id uuid, full_name text, avatar_url text, xp bigint, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_from date := case when p_period = 'week' then date_trunc('week', public.app_today())::date else date '2000-01-01' end;
begin
  if v_me is null or p_scope is null or p_scope not in ('box', 'squad', 'global') then return; end if;
  if p_scope = 'box' and (p_id is null or not (public.is_box_member(p_id) or public.is_box_coach(p_id))) then return; end if;
  if p_scope = 'squad' and (p_id is null or not public.is_squad_member(p_id)) then return; end if;
  return query
    with people as (
      select p.id from public.profiles p
      where (p.id = v_me or (p.league_public and (p_scope <> 'global' or p.profile_public)))
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

-- 6d. leave_squad: explicit sign-in check.
create or replace function public.leave_squad(p_squad uuid)
returns json language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not_signed_in'; end if;
  delete from public.squad_members where squad_id = p_squad and user_id = auth.uid();
  delete from public.squads s where s.id = p_squad and not exists (select 1 from public.squad_members m where m.squad_id = s.id);
  return json_build_object('ok', true);
end;
$$;

-- 6e. Grants: the progress RPCs are for signed-in people only (014 left them to the defaults).
revoke all on function public.my_progress() from public, anon;
revoke all on function public.xp_ranking(text, uuid, text) from public, anon;
revoke all on function public.create_squad(text, int) from public, anon;
revoke all on function public.join_squad(text) from public, anon;
revoke all on function public.leave_squad(uuid) from public, anon;
revoke all on function public.is_squad_member(uuid) from public, anon;
grant execute on function public.my_progress() to authenticated;
grant execute on function public.xp_ranking(text, uuid, text) to authenticated;
grant execute on function public.create_squad(text, int) to authenticated;
grant execute on function public.join_squad(text) to authenticated;
grant execute on function public.leave_squad(uuid) to authenticated;
grant execute on function public.is_squad_member(uuid) to authenticated;

-- Squad codes: 8 characters (6 could be guessed by trying many).
alter table public.squads alter column invite_code set default upper(substr(md5(gen_random_uuid()::text), 1, 8));



commit;
