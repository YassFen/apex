-- 002_profile_social.sql
-- Adds social/profile personalization fields, storage buckets for avatars/box logos,
-- and RLS policies for editing own box and reading public athlete profiles.

-- ───────────────────────────────────────────────────────────────────────────────
-- PROFILES: favorite movement + visibility flags
-- ───────────────────────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists favorite_movement text,
  add column if not exists profile_public   boolean not null default false,
  add column if not exists show_prs_public  boolean not null default false;

-- Public read policy for public profiles (anon + authenticated can SELECT only
-- rows where profile_public = true).
drop policy if exists "Public profiles are viewable" on public.profiles;
create policy "Public profiles are viewable"
  on public.profiles for select
  using (profile_public = true);

-- ───────────────────────────────────────────────────────────────────────────────
-- PR_RECORDS: allow reading records of users who opted into public PRs
-- ───────────────────────────────────────────────────────────────────────────────
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

-- ───────────────────────────────────────────────────────────────────────────────
-- BOXES: owners can update their own box
-- ───────────────────────────────────────────────────────────────────────────────
drop policy if exists "Owners can update their box" on public.boxes;
create policy "Owners can update their box"
  on public.boxes for update
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────────
-- STORAGE BUCKETS: avatars + box-logos (public read, auth write own folder)
-- ───────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('box-logos', 'box-logos', true)
  on conflict (id) do nothing;

-- Avatars: users write to avatars/{uid}/*
drop policy if exists "Avatar public read" on storage.objects;
create policy "Avatar public read"
  on storage.objects for select
  using (bucket_id in ('avatars', 'box-logos'));

drop policy if exists "Avatar owner insert" on storage.objects;
create policy "Avatar owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatar owner update" on storage.objects;
create policy "Avatar owner update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Avatar owner delete" on storage.objects;
create policy "Avatar owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Box logos: box owners write to box-logos/{box_id}/*
drop policy if exists "Box logo owner insert" on storage.objects;
create policy "Box logo owner insert"
  on storage.objects for insert
  with check (
    bucket_id = 'box-logos'
    and exists (
      select 1 from public.boxes b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "Box logo owner update" on storage.objects;
create policy "Box logo owner update"
  on storage.objects for update
  using (
    bucket_id = 'box-logos'
    and exists (
      select 1 from public.boxes b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );

drop policy if exists "Box logo owner delete" on storage.objects;
create policy "Box logo owner delete"
  on storage.objects for delete
  using (
    bucket_id = 'box-logos'
    and exists (
      select 1 from public.boxes b
      where b.id::text = (storage.foldername(name))[1]
        and b.owner_id = auth.uid()
    )
  );
