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
