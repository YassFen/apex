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
