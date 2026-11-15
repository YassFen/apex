-- ═══════════════════════════════════════════════════════════════════════════════
-- 017 · Athlete-side fixes: box movement names, staff-entered competition results,
--       WOD result edit counter, PR flag, write-policy holes and fixes for 014.
-- Safe to run more than once and inside one transaction. Run after 001–016 (needs 014).
-- ═══════════════════════════════════════════════════════════════════════════════
begin;

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
