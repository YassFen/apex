-- APEX-MIG-004: sincroniza producción con lo que la app ya usa + correcciones de seguridad.
--
-- Ejecutar UNA vez en Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Es idempotente: se puede volver a ejecutar sin romper nada.
--
-- Incluye:
--   1. Todo lo de 002 (perfil social, buckets de avatars/logos) y 003 (movimientos cardio),
--      que nunca se aplicaron en producción.
--   2. Columnas que la app usa y no existían: wod_results.edit_count, campos de perfil del box.
--   3. Métrica '2rm' en pr_records y cálculo correcto de PR para tiempo (menor = mejor).
--   4. Seguridad: nadie puede volverse admin, y unirse a un box exige el código de invitación.
--   5. Realtime: publica daily_wods y wod_results.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1a. PROFILES (de 002)
-- ═══════════════════════════════════════════════════════════════════════════════
alter table public.profiles
  add column if not exists favorite_movement text,
  add column if not exists profile_public   boolean not null default false,
  add column if not exists show_prs_public  boolean not null default false;

drop policy if exists "Public profiles are viewable" on public.profiles;
create policy "Public profiles are viewable"
  on public.profiles for select
  using (profile_public = true);

drop policy if exists "Public PRs are viewable" on public.pr_records;
create policy "Public PRs are viewable"
  on public.pr_records for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = pr_records.user_id
        and p.profile_public = true
        and p.show_prs_public = true
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1b. STORAGE: avatars + box-logos (de 002)
-- ═══════════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('box-logos', 'box-logos', true)
  on conflict (id) do nothing;

drop policy if exists "Avatar public read" on storage.objects;
create policy "Avatar public read" on storage.objects for select
  using (bucket_id in ('avatars', 'box-logos'));

drop policy if exists "Avatar owner insert" on storage.objects;
create policy "Avatar owner insert" on storage.objects for insert
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatar owner update" on storage.objects;
create policy "Avatar owner update" on storage.objects for update
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Avatar owner delete" on storage.objects;
create policy "Avatar owner delete" on storage.objects for delete
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Box logo owner insert" on storage.objects;
create policy "Box logo owner insert" on storage.objects for insert
  with check (
    bucket_id = 'box-logos'
    and exists (select 1 from public.boxes b
                where b.id::text = (storage.foldername(name))[1] and b.owner_id = auth.uid())
  );

drop policy if exists "Box logo owner update" on storage.objects;
create policy "Box logo owner update" on storage.objects for update
  using (
    bucket_id = 'box-logos'
    and exists (select 1 from public.boxes b
                where b.id::text = (storage.foldername(name))[1] and b.owner_id = auth.uid())
  );

drop policy if exists "Box logo owner delete" on storage.objects;
create policy "Box logo owner delete" on storage.objects for delete
  using (
    bucket_id = 'box-logos'
    and exists (select 1 from public.boxes b
                where b.id::text = (storage.foldername(name))[1] and b.owner_id = auth.uid())
  );

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1c. MOVIMIENTOS monoestructurales (de 003)
-- ═══════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'movements_name_key'
  ) then
    alter table public.movements add constraint movements_name_key unique (name);
  end if;
end $$;

insert into public.movements (name, category, description) values
  ('Ski Erg',      'cardio', 'Esquiadora vertical — registrar tiempo de distancia o calorías'),
  ('Assault Bike', 'cardio', 'Bicicleta de asalto — registrar tiempo hasta X calorías'),
  ('Aerobike',     'cardio', 'Aerodyne / Aerobike — tiempo o calorías'),
  ('Echo Bike',    'cardio', 'Rogue Echo Bike — tiempo o calorías'),
  ('Rower (Row)',  'cardio', 'Remoergómetro — tiempo en distancia o calorías'),
  ('30 cal Row',   'cardio', 'Tiempo para completar 30 calorías en remo'),
  ('50 cal Row',   'cardio', 'Tiempo para completar 50 calorías en remo'),
  ('30 cal Bike',  'cardio', 'Tiempo para completar 30 calorías en bicicleta'),
  ('50 cal Bike',  'cardio', 'Tiempo para completar 50 calorías en bicicleta'),
  ('30 cal Ski',   'cardio', 'Tiempo para completar 30 calorías en Ski Erg'),
  ('2000m Row',    'cardio', 'Tiempo para completar 2000m en remo'),
  ('Squat Snatch', 'olympic', 'Arranque con recepción en sentadilla completa'),
  ('Squat Clean',  'olympic', 'Cargada con recepción en sentadilla completa'),
  ('Thruster',     'weightlifting', 'Front squat + push press en un solo movimiento'),
  ('Double-Under', 'gymnastics', 'Saltos de cuerda con doble pasada')
on conflict (name) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. COLUMNAS que la app usa y no existían
-- ═══════════════════════════════════════════════════════════════════════════════
alter table public.wod_results
  add column if not exists edit_count integer not null default 0;

alter table public.boxes
  add column if not exists description text,
  add column if not exists website_url text,
  add column if not exists instagram   text,
  add column if not exists whatsapp    text,
  add column if not exists schedule    text,
  add column if not exists disciplines text[];

-- ═══════════════════════════════════════════════════════════════════════════════
-- 3. PRs: métrica 2RM + PR correcto para tiempo (menor es mejor) + recálculo al borrar
-- ═══════════════════════════════════════════════════════════════════════════════
alter table public.pr_records drop constraint if exists pr_records_metric_check;
alter table public.pr_records add constraint pr_records_metric_check
  check (metric in ('1rm','2rm','3rm','max_reps','time'));

create or replace function public.recalc_pr_for(p_user uuid, p_movement uuid, p_metric text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.pr_records set is_pr = false
  where user_id = p_user and movement_id = p_movement and metric = p_metric;

  update public.pr_records set is_pr = true
  where id = (
    select id from public.pr_records
    where user_id = p_user and movement_id = p_movement and metric = p_metric
    order by
      case when p_metric = 'time' then value_lb end asc,
      case when p_metric <> 'time' then value_lb end desc,
      recorded_at asc
    limit 1
  );
end;
$$;

create or replace function public.recalc_pr()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.recalc_pr_for(old.user_id, old.movement_id, old.metric);
    return old;
  end if;
  perform public.recalc_pr_for(new.user_id, new.movement_id, new.metric);
  if tg_op = 'UPDATE' and (old.movement_id <> new.movement_id or old.metric <> new.metric) then
    perform public.recalc_pr_for(old.user_id, old.movement_id, old.metric);
  end if;
  return new;
end;
$$;

-- El trigger hace UPDATE sobre la misma tabla; pg_trigger_depth evita la recursión.
drop trigger if exists trg_recalc_pr on public.pr_records;
create trigger trg_recalc_pr
  after insert or update of value_lb, metric, movement_id or delete on public.pr_records
  for each row when (pg_trigger_depth() < 1)
  execute function public.recalc_pr();

-- Recalcula todos los PRs existentes con la regla nueva.
do $$
declare r record;
begin
  for r in select distinct user_id, movement_id, metric from public.pr_records loop
    perform public.recalc_pr_for(r.user_id, r.movement_id, r.metric);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 4. SEGURIDAD
-- ═══════════════════════════════════════════════════════════════════════════════
-- 4a. Al registrarse solo se puede elegir athlete o coach (antes se podía mandar 'admin').
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    case when new.raw_user_meta_data->>'role' = 'coach' then 'coach' else 'athlete' end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 4b. Un usuario no puede subirse el rol a admin editando su propio perfil.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and (new.role = 'admin' or old.role = 'admin') then
    raise exception 'No puedes cambiar a ese rol';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_role on public.profiles;
create trigger trg_guard_profile_role
  before update of role on public.profiles
  for each row execute function public.guard_profile_role();

-- 4c. Unirse a un box: solo con código válido y siempre como atleta.
--     Antes cualquiera podía insertarse en cualquier box, incluso como coach.
drop policy if exists "Anyone can join via invite" on public.box_members;
drop policy if exists "Owner joins own box as coach" on public.box_members;
create policy "Owner joins own box as coach" on public.box_members for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.boxes b where b.id = box_id and b.owner_id = auth.uid())
  );

create or replace function public.join_box_by_code(p_code text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_box public.boxes%rowtype;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_box from public.boxes where invite_code = upper(trim(p_code));
  if not found then
    return json_build_object('ok', false, 'reason', 'invalid_code');
  end if;

  if exists (select 1 from public.box_members
             where box_id = v_box.id and user_id = v_uid and is_active) then
    return json_build_object('ok', false, 'reason', 'already_member', 'box_name', v_box.name);
  end if;

  insert into public.box_members (box_id, user_id, role, is_active)
  values (v_box.id, v_uid, 'athlete', true)
  on conflict (box_id, user_id) do update set is_active = true;

  return json_build_object('ok', true, 'box_id', v_box.id, 'box_name', v_box.name);
end;
$$;

revoke all on function public.join_box_by_code(text) from public, anon;
grant execute on function public.join_box_by_code(text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 5. REALTIME: WOD en vivo + leaderboard
-- ═══════════════════════════════════════════════════════════════════════════════
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'daily_wods') then
    alter publication supabase_realtime add table public.daily_wods;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'wod_results') then
    alter publication supabase_realtime add table public.wod_results;
  end if;
end $$;
