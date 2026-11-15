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
