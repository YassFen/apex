-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

-- ─── PROFILES ───────────────────────────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  email           text not null,
  full_name       text not null default '',
  avatar_url      text,
  role            text not null default 'athlete' check (role in ('athlete','coach','admin')),
  preferred_unit  text not null default 'lb' check (preferred_unit in ('lb','kg')),
  tracking_since  date,
  bio             text,
  city            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    coalesce(new.raw_user_meta_data->>'role', 'athlete')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── BOXES ──────────────────────────────────────────────────────────────────
create table public.boxes (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  slug            text not null unique,
  logo_url        text,
  city            text not null default '',
  country         text not null default '',
  owner_id        uuid not null references public.profiles(id) on delete restrict,
  affiliate_code  text,
  invite_code     text not null unique default upper(substring(uuid_generate_v4()::text, 1, 8)),
  plan            text not null default 'free' check (plan in ('free','pro','enterprise')),
  created_at      timestamptz not null default now()
);

-- ─── BOX MEMBERS ────────────────────────────────────────────────────────────
create table public.box_members (
  id        uuid primary key default uuid_generate_v4(),
  box_id    uuid not null references public.boxes(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null default 'athlete' check (role in ('athlete','coach','admin')),
  joined_at timestamptz not null default now(),
  is_active boolean not null default true,
  unique(box_id, user_id)
);

-- ─── MOVEMENTS ──────────────────────────────────────────────────────────────
create table public.movements (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null unique,
  category    text not null check (category in ('weightlifting','olympic','gymnastics','benchmark','cardio')),
  description text,
  video_url   text
);

-- ─── PR RECORDS ─────────────────────────────────────────────────────────────
create table public.pr_records (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  movement_id  uuid not null references public.movements(id) on delete restrict,
  value_lb     numeric(7,2) not null,
  metric       text not null default '1rm' check (metric in ('1rm','3rm','max_reps','time')),
  recorded_at  timestamptz not null default now(),
  notes        text,
  is_pr        boolean not null default false
);

-- After insert/update, recalculate is_pr flags for that user+movement
-- FIX: rewritten to avoid variable naming conflict with PostgreSQL internals
create or replace function public.recalc_pr()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Step 1: mark all records for this user+movement+metric as NOT PR
  update public.pr_records
  set is_pr = false
  where user_id = new.user_id
    and movement_id = new.movement_id
    and metric = new.metric;

  -- Step 2: mark the single highest record as the PR
  update public.pr_records
  set is_pr = true
  where id = (
    select id
    from public.pr_records
    where user_id = new.user_id
      and movement_id = new.movement_id
      and metric = new.metric
    order by value_lb desc
    limit 1
  );

  return new;
end;
$$;

create trigger trg_recalc_pr
  after insert or update of value_lb on public.pr_records
  for each row execute function public.recalc_pr();

-- ─── WOD TEMPLATES ──────────────────────────────────────────────────────────
create table public.wod_templates (
  id            uuid primary key default uuid_generate_v4(),
  box_id        uuid references public.boxes(id) on delete cascade,
  created_by    uuid not null references public.profiles(id) on delete restrict,
  name          text not null,
  type          text not null check (type in ('fortime','amrap','emom','tabata','strength')),
  description   text not null default '',
  duration_mins integer,
  movements     jsonb not null default '[]',
  is_public     boolean not null default false,
  created_at    timestamptz not null default now()
);

-- ─── DAILY WODS ─────────────────────────────────────────────────────────────
create table public.daily_wods (
  id               uuid primary key default uuid_generate_v4(),
  box_id           uuid not null references public.boxes(id) on delete cascade,
  coach_id         uuid not null references public.profiles(id) on delete restrict,
  wod_template_id  uuid references public.wod_templates(id) on delete set null,
  published_at     timestamptz not null default now(),
  scheduled_for    date not null default current_date,
  title            text not null,
  description      text not null default '',
  movements        jsonb not null default '[]',
  is_live          boolean not null default true,
  type             text not null check (type in ('fortime','amrap','emom','tabata','strength')),
  duration_mins    integer
);

-- ─── WOD RESULTS ────────────────────────────────────────────────────────────
create table public.wod_results (
  id            uuid primary key default uuid_generate_v4(),
  daily_wod_id  uuid not null references public.daily_wods(id) on delete cascade,
  user_id       uuid not null references public.profiles(id) on delete cascade,
  result_type   text not null check (result_type in ('time','rounds','weight','reps')),
  result_value  text not null,
  rx_level      text not null default 'rx' check (rx_level in ('rx','scaled','rx+')),
  notes         text,
  recorded_at   timestamptz not null default now(),
  unique(daily_wod_id, user_id)
);

-- ─── BENCHMARKS ─────────────────────────────────────────────────────────────
create table public.benchmarks (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  name         text not null,
  result       text not null,
  recorded_at  timestamptz not null default now(),
  notes        text,
  level        text
);

-- ─── INDEXES ────────────────────────────────────────────────────────────────
create index idx_pr_records_user_mov on public.pr_records(user_id, movement_id);
create index idx_daily_wods_box_date on public.daily_wods(box_id, scheduled_for desc);
create index idx_wod_results_wod     on public.wod_results(daily_wod_id);
create index idx_box_members_box     on public.box_members(box_id, is_active);
create index idx_box_members_user    on public.box_members(user_id, is_active);

-- ─── ROW LEVEL SECURITY ─────────────────────────────────────────────────────

alter table public.profiles      enable row level security;
alter table public.boxes         enable row level security;
alter table public.box_members   enable row level security;
alter table public.movements     enable row level security;
alter table public.pr_records    enable row level security;
alter table public.wod_templates enable row level security;
alter table public.daily_wods    enable row level security;
alter table public.wod_results   enable row level security;
alter table public.benchmarks    enable row level security;

-- helper: is current user a member of a given box?
create or replace function public.is_box_member(p_box_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.box_members
    where box_id = p_box_id and user_id = auth.uid() and is_active = true
  );
$$;

-- helper: is current user a coach/owner of a given box?
create or replace function public.is_box_coach(p_box_id uuid)
returns boolean language sql security definer set search_path = public as $$
  select exists(
    select 1 from public.box_members
    where box_id = p_box_id and user_id = auth.uid() and role in ('coach','admin') and is_active = true
  ) or exists(
    select 1 from public.boxes
    where id = p_box_id and owner_id = auth.uid()
  );
$$;

-- ─── RLS POLICIES ───────────────────────────────────────────────────────────

-- PROFILES
create policy "Users can view own profile"    on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile"  on public.profiles for update using (auth.uid() = id);
create policy "Box members can view profiles" on public.profiles for select using (
  exists(
    select 1 from public.box_members bm1
    join public.box_members bm2 on bm1.box_id = bm2.box_id
    where bm1.user_id = auth.uid() and bm2.user_id = profiles.id and bm1.is_active and bm2.is_active
  )
);

-- BOXES
create policy "Public can read boxes"        on public.boxes for select using (true);
create policy "Owner can update box"         on public.boxes for update using (owner_id = auth.uid());
create policy "Authenticated can create box" on public.boxes for insert with check (auth.uid() is not null);

-- BOX MEMBERS
create policy "Members can view box roster" on public.box_members for select using (is_box_member(box_id));
create policy "Anyone can join via invite"  on public.box_members for insert with check (auth.uid() = user_id);
create policy "Coach can manage members"    on public.box_members for update using (is_box_coach(box_id));
create policy "Members can leave"           on public.box_members for delete using (auth.uid() = user_id);

-- MOVEMENTS
create policy "Anyone can read movements"  on public.movements for select using (true);
create policy "Admin can manage movements" on public.movements for all using (
  exists(select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

-- PR RECORDS
create policy "Own PRs readable"    on public.pr_records for select using (auth.uid() = user_id);
create policy "Box coaches see PRs" on public.pr_records for select using (
  exists(
    select 1 from public.box_members bm_me
    join public.box_members bm_them on bm_me.box_id = bm_them.box_id
    where bm_me.user_id = auth.uid() and bm_me.role in ('coach','admin')
      and bm_them.user_id = pr_records.user_id and bm_me.is_active and bm_them.is_active
  )
);
create policy "Own PRs insertable" on public.pr_records for insert with check (auth.uid() = user_id);
create policy "Own PRs updatable"  on public.pr_records for update using (auth.uid() = user_id);
create policy "Own PRs deletable"  on public.pr_records for delete using (auth.uid() = user_id);

-- WOD TEMPLATES
create policy "Box members see templates"  on public.wod_templates for select using (
  is_public = true or is_box_member(box_id) or created_by = auth.uid()
);
create policy "Coach can create templates" on public.wod_templates for insert with check (auth.uid() = created_by);
create policy "Coach can update templates" on public.wod_templates for update using (
  created_by = auth.uid() or is_box_coach(box_id)
);

-- DAILY WODS
create policy "Box members see daily wods" on public.daily_wods for select using (is_box_member(box_id));
create policy "Coach can publish wods"     on public.daily_wods for insert with check (
  is_box_coach(box_id) and auth.uid() = coach_id
);
create policy "Coach can update wod"       on public.daily_wods for update using (is_box_coach(box_id));

-- WOD RESULTS
create policy "Own results readable"        on public.wod_results for select using (auth.uid() = user_id);
create policy "Box members see results"     on public.wod_results for select using (
  exists(
    select 1 from public.daily_wods dw
    where dw.id = wod_results.daily_wod_id and is_box_member(dw.box_id)
  )
);
create policy "Athletes insert own results" on public.wod_results for insert with check (auth.uid() = user_id);
create policy "Athletes update own results" on public.wod_results for update using (auth.uid() = user_id);

-- BENCHMARKS
create policy "Own benchmarks"             on public.benchmarks for select using (auth.uid() = user_id);
create policy "Box coaches see benchmarks" on public.benchmarks for select using (
  exists(
    select 1 from public.box_members bm_me
    join public.box_members bm_them on bm_me.box_id = bm_them.box_id
    where bm_me.user_id = auth.uid() and bm_me.role in ('coach','admin')
      and bm_them.user_id = benchmarks.user_id and bm_me.is_active and bm_them.is_active
  )
);
create policy "Insert own benchmarks" on public.benchmarks for insert with check (auth.uid() = user_id);
create policy "Update own benchmarks" on public.benchmarks for update using (auth.uid() = user_id);
create policy "Delete own benchmarks" on public.benchmarks for delete using (auth.uid() = user_id);
