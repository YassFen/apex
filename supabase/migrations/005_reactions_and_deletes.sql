-- ═══════════════════════════════════════════════════════════════════════════════
-- 005 · "Fuego" reactions on WOD results + missing delete policies
-- Run in Supabase Dashboard → SQL Editor. Idempotent: safe to run more than once.
-- The app hides the button until this table exists.
-- ═══════════════════════════════════════════════════════════════════════════════

create table if not exists public.wod_result_bumps (
  result_id  uuid not null references public.wod_results(id) on delete cascade,
  user_id    uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (result_id, user_id)
);

alter table public.wod_result_bumps enable row level security;

-- Visible to members of the box the WOD belongs to.
drop policy if exists "Box members see bumps" on public.wod_result_bumps;
create policy "Box members see bumps" on public.wod_result_bumps for select using (
  exists (
    select 1 from public.wod_results r
    join public.daily_wods d on d.id = r.daily_wod_id
    where r.id = wod_result_bumps.result_id and public.is_box_member(d.box_id)
  )
);

-- You can only bump as yourself, on results from your own box.
drop policy if exists "Members bump results in their box" on public.wod_result_bumps;
create policy "Members bump results in their box" on public.wod_result_bumps for insert with check (
  auth.uid() = user_id and exists (
    select 1 from public.wod_results r
    join public.daily_wods d on d.id = r.daily_wod_id
    where r.id = wod_result_bumps.result_id and public.is_box_member(d.box_id)
  )
);

drop policy if exists "Users remove own bumps" on public.wod_result_bumps;
create policy "Users remove own bumps" on public.wod_result_bumps for delete using (auth.uid() = user_id);

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'wod_result_bumps') then
    alter publication supabase_realtime add table public.wod_result_bumps;
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Deletes that were missing from 001: a coach can delete a WOD of their box
-- (its results and bumps go with it via ON DELETE CASCADE), and an athlete can
-- delete their own result.
-- ═══════════════════════════════════════════════════════════════════════════════
drop policy if exists "Coach can delete wod" on public.daily_wods;
create policy "Coach can delete wod" on public.daily_wods for delete using (public.is_box_coach(box_id));

drop policy if exists "Athletes delete own results" on public.wod_results;
create policy "Athletes delete own results" on public.wod_results for delete using (auth.uid() = user_id);
