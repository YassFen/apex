-- 008_challenges_media.sql
-- Box challenges with a ranking, and photo uploads for exercises.
-- Run by hand in Supabase Dashboard → SQL Editor, after 007. Idempotent.

-- ─── Challenges ────────────────────────────────────────────────────────────
-- Any member of a box can create a challenge ("100 burpees esta semana");
-- the others join and log what they do. The ranking is the sum of entries.
create table if not exists public.challenges (
  id          uuid primary key default uuid_generate_v4(),
  box_id      uuid not null references public.boxes(id) on delete cascade,
  created_by  uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 80),
  movement    text not null check (char_length(movement) between 1 and 80),
  target      integer not null check (target > 0),
  unit        text not null default 'reps' check (unit in ('reps', 'cal', 'm', 'min')),
  starts_on   date not null default public.app_today(),
  ends_on     date not null,
  created_at  timestamptz not null default now(),
  check (ends_on >= starts_on)
);
create index if not exists idx_challenges_box on public.challenges(box_id, ends_on desc);

create table if not exists public.challenge_participants (
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  user_id      uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  joined_at    timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

create table if not exists public.challenge_entries (
  id            uuid primary key default uuid_generate_v4(),
  challenge_id  uuid not null references public.challenges(id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  amount        integer not null check (amount > 0),
  logged_on     date not null default public.app_today(),
  created_at    timestamptz not null default now()
);
create index if not exists idx_challenge_entries on public.challenge_entries(challenge_id, user_id);

alter table public.challenges             enable row level security;
alter table public.challenge_participants enable row level security;
alter table public.challenge_entries      enable row level security;

create or replace function public.can_see_challenge(p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.challenges c
    where c.id = p_id and (public.is_box_member(c.box_id) or public.is_box_coach(c.box_id))
  );
$$;

drop policy if exists "Members see box challenges" on public.challenges;
create policy "Members see box challenges" on public.challenges for select using (public.is_box_member(box_id) or public.is_box_coach(box_id));
drop policy if exists "Members create challenges" on public.challenges;
create policy "Members create challenges" on public.challenges for insert with check (
  created_by = auth.uid() and (public.is_box_member(box_id) or public.is_box_coach(box_id))
);
drop policy if exists "Creator or coach edits challenge" on public.challenges;
create policy "Creator or coach edits challenge" on public.challenges for update using (created_by = auth.uid() or public.is_box_coach(box_id));
drop policy if exists "Creator or coach deletes challenge" on public.challenges;
create policy "Creator or coach deletes challenge" on public.challenges for delete using (created_by = auth.uid() or public.is_box_coach(box_id));

drop policy if exists "See challenge participants" on public.challenge_participants;
create policy "See challenge participants" on public.challenge_participants for select using (public.can_see_challenge(challenge_id));
drop policy if exists "Join challenges" on public.challenge_participants;
create policy "Join challenges" on public.challenge_participants for insert with check (user_id = auth.uid() and public.can_see_challenge(challenge_id));
drop policy if exists "Leave challenges" on public.challenge_participants;
create policy "Leave challenges" on public.challenge_participants for delete using (user_id = auth.uid());

drop policy if exists "See challenge entries" on public.challenge_entries;
create policy "See challenge entries" on public.challenge_entries for select using (public.can_see_challenge(challenge_id));
drop policy if exists "Log own challenge entries" on public.challenge_entries;
create policy "Log own challenge entries" on public.challenge_entries for insert with check (user_id = auth.uid() and public.can_see_challenge(challenge_id));
drop policy if exists "Delete own challenge entries" on public.challenge_entries;
create policy "Delete own challenge entries" on public.challenge_entries for delete using (user_id = auth.uid());

-- ─── Exercise photos ───────────────────────────────────────────────────────
-- Public bucket; files go under <box_id>/..., and only coaches of that box can upload.
insert into storage.buckets (id, name, public)
values ('movement-media', 'movement-media', true)
on conflict (id) do nothing;

drop policy if exists "Public read movement media" on storage.objects;
create policy "Public read movement media" on storage.objects for select using (bucket_id = 'movement-media');
drop policy if exists "Coaches upload movement media" on storage.objects;
create policy "Coaches upload movement media" on storage.objects for insert to authenticated with check (
  bucket_id = 'movement-media' and public.is_box_coach(((storage.foldername(name))[1])::uuid)
);
drop policy if exists "Coaches replace movement media" on storage.objects;
create policy "Coaches replace movement media" on storage.objects for update to authenticated using (
  bucket_id = 'movement-media' and public.is_box_coach(((storage.foldername(name))[1])::uuid)
);
