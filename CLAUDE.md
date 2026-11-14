# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**APEX** is a B2B2C CrossFit gym management platform built with Next.js 15 + Supabase. Two roles exist: **Coach** (owns a box/gym, publishes daily workouts) and **Athlete** (logs PRs, views live WODs, competes on leaderboard). The star feature is a live WOD broadcast using Supabase Realtime — when a coach publishes a WOD, athletes see it instantly without refreshing.

---

## Commands

```bash
npm run dev          # Start local dev server at http://localhost:3000
npm run build        # Production build (runs TypeScript check)
npm run lint         # ESLint
```

No test suite is configured yet.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 App Router (TypeScript) |
| Database + Auth | Supabase (PostgreSQL + RLS + Realtime) |
| Styling | Tailwind CSS with custom design tokens |
| Fonts | Geist for everything (`font-sans`, `font-display` for headings and big numbers) |
| Icons | Phosphor via `components/ui/icons.ts` (old Lucide names are aliased there); `weight="fill"` for active states |
| Motion | `motion` (`motion/react`) |
| Deployment | Vercel |
| PWA | `public/sw.js` + `public/manifest.json` |

---

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

---

## Architecture

### Route Groups

```
app/
├── page.tsx                        # Root → redirects to /dashboard or /auth/login
├── layout.tsx                      # Root layout (PWA meta, service worker registration)
├── auth/
│   ├── layout.tsx                  # Centered card layout for auth pages
│   ├── login/page.tsx              # Email/password + Google OAuth
│   ├── register/page.tsx           # Signup with role selector (athlete/coach) + optional invite code
│   ├── reset-password/page.tsx     # Password recovery: 6-digit email code (verifyOtp recovery) → new password
│   └── callback/route.ts           # OAuth, email confirmation and reset links (code or token_hash)
└── (dashboard)/
    ├── layout.tsx                  # Server component: verifies auth, fetches profile, wraps DashboardShell
    ├── dashboard/page.tsx          # Branches: CoachDashboard or AthleteDashboard based on profile.role
    ├── wod/page.tsx                # Athlete: live WOD view (+ "Tus números" from 1RMs, fuego reactions)
    ├── wod/history/page.tsx        # Athlete: last 60 days of WODs with result, place and attendance
    ├── prs/page.tsx                # Athlete: personal records
    ├── timer/page.tsx              # Timer (all users)
    ├── calc/page.tsx               # 1RM Calculator (all users): estimate, % table, plates (lb/kg, 3 bars), warm-up ramp
    ├── calendar/page.tsx           # Calendar (all users): month grid of WODs + events, box filter (?m=YYYY-MM)
    ├── calendar/event/new/page.tsx # Create a personal or box event (?date=)
    ├── calendar/event/[id]/page.tsx        # Event: countdown, sign-up (category/division), readiness per movement
    ├── calendar/event/[id]/edit/page.tsx   # Edit event + its workouts
    ├── benchmarks/page.tsx         # Athlete: benchmark results
    ├── coach/publish-wod/page.tsx  # Coach: publish or program WODs up to 13 days ahead (?date=), one per class time (?wod=<id>|new)
    ├── challenges/page.tsx         # Box challenges: join, log amounts, ranking; anyone in the box creates one (?open=<id>)
    ├── competitions/page.tsx       # Athlete: past/upcoming competitions, final places and progress chart
    ├── movements/page.tsx          # Exercise library (how-to, muscles, video, your records); coaches add box movements
    ├── settings/page.tsx           # Settings hub (iOS-style grouped list)
    ├── settings/[section]/page.tsx # profile | training | privacy | box | boxes | athletic | appearance | notifications | security
    └── coach/athletes/page.tsx     # Coach: view box roster + invite code
```

### Component Structure

```
components/
├── ui/           # Primitives: Button, Card, Modal, Toast, Badge
├── layout/       # DashboardShell, Sidebar, MobileNav, Topbar
├── athlete/      # AthleteDashboard, PRsView, PRModal, TimerView, RMCalcView, BenchmarksView, StrengthChart
├── wod/          # WodView (Realtime), WodLeaderboard, WodResultModal
└── coach/        # CoachDashboard, PublishWodPanel
```

### Data Flow Pattern

All `(dashboard)` **pages** are Server Components that fetch data from Supabase and pass it as props to **Client Components**. Client components then handle interactivity and Realtime subscriptions.

```
page.tsx (server) → fetches data → Client Component (receives props, manages state/realtime)
```

Never do data fetching inside Client Components on mount (except for Realtime-triggered refreshes).

---

## Supabase Integration

### Two Clients — Never Mix Them

| Client | File | Use When |
|---|---|---|
| Server | `lib/supabase/server.ts` | Server Components, Route Handlers, Middleware |
| Browser | `lib/supabase/client.ts` | Client Components (`'use client'`) |

```ts
// Server Component
import { createClient } from '@/lib/supabase/server'
const supabase = await createClient()   // async — must await

// Client Component
import { createClient } from '@/lib/supabase/client'
const supabase = createClient()         // sync — no await
```

### TypeScript Casting Pattern

Supabase generic inference is disabled (no `Database` generic). Always cast query results explicitly:

```ts
const { data: p } = await supabase.from('profiles').select('*').eq('id', user.id).single()
const profile = p as Profile | null

// For join queries (e.g. select with relationships):
const { data: rawPrs } = await supabase.from('pr_records').select('*, movements(name)')
const prs = (rawPrs ?? []) as any[]
```

**Never** use `data!` (non-null assertion on query results). Always handle `null`.

### Auth Pattern in Every Protected Page

```ts
const { data: { user } } = await supabase.auth.getUser()
if (!user) redirect('/auth/login')
```

The `(dashboard)/layout.tsx` already does this — individual pages only need it if they have role-specific redirects.

---

## Database Schema Summary

9 tables. All have RLS enabled.

| Table | Purpose |
|---|---|
| `profiles` | Auto-created on signup via `handle_new_user` trigger. Linked 1:1 to `auth.users`. |
| `boxes` | A gym/box. Has `invite_code` (8-char uppercase unique). `owner_id` → profile. |
| `box_members` | Many-to-many: profiles ↔ boxes. Has `role` (athlete/coach/admin) and `is_active`. |
| `movements` | Master list of CrossFit movements (seeded). Categories: weightlifting/olympic/gymnastics/benchmark/cardio. |
| `pr_records` | Athlete PR logs. Trigger `recalc_pr` auto-sets `is_pr = true` on the highest record per user+movement+metric. |
| `wod_templates` | Reusable WOD blueprints (optional). |
| `daily_wods` | Today's workout published by a coach. `is_live` controls Realtime broadcast. |
| `wod_results` | Athlete result for a daily WOD. Unique per `(daily_wod_id, user_id)`. |
| `benchmarks` | Athlete named benchmark results (Fran time, Grace time, etc.). |
| `events` | Competitions/events (006). `box_id` null = personal (creator only); set = box event published by a coach, visible to members. |
| `event_workouts` | Workouts of an event (006). `movements` jsonb: `[{ name, reps, load_lb, load_lb_f }]` (men's/women's load). |
| `event_participants` | Who goes to an event (006), with `category` (m/f, picks the load) and `division` (rx/scaled/masters/teens); `final_place`/`field_size` (007). |
| `event_results` | Athlete's mark and place in each event workout (007). |
| `personal_logs` | Training done on your own: movement, sets × reps / distance, load (007). |
| `challenges` / `challenge_participants` / `challenge_entries` | Box challenges (008): target per movement and dates; the ranking is the sum of entries. |
| `goals` | Athlete goals: movement, target, unit, period today/week/daily/weekly (007). |

### Key RLS Helpers (PostgreSQL functions)

```sql
public.is_box_member(p_box_id uuid) → boolean
public.is_box_coach(p_box_id uuid) → boolean
```

These are used throughout all RLS policies. An athlete sees WODs/results only for boxes they belong to.

### Realtime Setup

`daily_wods` and `wod_results` are added to the `supabase_realtime` publication by `supabase/migrations/004_production_sync.sql` (plain `alter publication` works from the SQL Editor).

### Migrations

Migrations are run by hand in **Supabase Dashboard → SQL Editor**. `005_reactions_and_deletes.sql` adds `wod_result_bumps` ("fuego" reactions on leaderboard results, hidden in the UI until it exists) plus the missing delete policies on `daily_wods` (coach) and `wod_results` (own). Without it, "Quitar WOD" falls back to `is_live = false`. `006_calendar_events.sql` adds `daily_wods.show_early` (the coach decides whether a future WOD is visible before its day), rewrites the `daily_wods` select policy so athletes only see live WODs whose day has come (`app_today()`, Santiago) or that are `show_early`, adds the `box_wod_days()` RPC (days with a WOD, without content, for "WOD programado") and the three event tables with RLS (`can_see_event()` / `can_edit_event()`). Until 006 runs, the calendar shows WODs only, events are hidden with a note, and programming ahead saves without `show_early` (athletes see future WODs right away). `007_sessions_results_library.sql` (after 006) adds `daily_wods.class_time` (several WODs per day, one per class), `profiles.sex` + `profiles.dashboard_layout`, `event_results`, final places, box movements (`movements.box_id/created_by/image_url/cues/muscles` + coach policies), `personal_logs` and `goals`. Every screen that uses 007 falls back when it's missing. `008_challenges_media.sql` adds box challenges and the public `movement-media` storage bucket (coaches upload exercise photos under `<box_id>/`, see `lib/utils/upload-image.ts`). `004_production_sync.sql` is idempotent and also contains everything from 002 and 003, which were never applied in production. Code that writes columns added in 004 (`wod_results.edit_count`, box profile fields) falls back gracefully if 004 is missing — see `isMissingColumn()` in `lib/utils/errors.ts`.

### Dates and time zones

Never compute "today" with `new Date().toISOString()` — Vercel runs in UTC, so in Chile the WOD vanishes every evening. Use `todayISO()` / `toDateInput()` / `dateInputToTimestamp()` / `formatDateOnly()` from `lib/utils/dates.ts` (`APP_TIME_ZONE = 'America/Santiago'`).

### Leaderboards

`wod_results.result_value` is text. Never sort it in SQL; use `rankResults()` from `lib/utils/wod-ranking.ts` (Rx+ > Rx > Scaled, then time ascending / rounds, reps and weight descending).

### Themes (light/dark + accent)

Every Tailwind color is a CSS variable holding RGB channels (`--c-bg`, `--c-ac`, …) defined in `app/globals.css`. Dark is the default, light comes from `data-theme="light"` on `<html>` (or the OS preference when the user picks "Sistema"), and the accent from `data-accent` (lima, violeta, cian, naranja, rosa, azul). Text on top of the accent uses `text-onac`, never `text-bg`. Theme helpers live in `lib/utils/theme.ts`; the picker is `components/ui/AppearancePicker.tsx` (Settings and the "Más" sheet). Chart.js reads colors with `themeColor()` and redraws via `useThemeVersion()`.

### Motion, toasts and dialogs

- Motion utilities live in `app/globals.css` (`animate-fade-up`, `animate-sheet`, `animate-pop`, `stagger`, `tap-card`, `skeleton`). Entrance animations use fill-mode `backwards`; never `both`/`forwards` with a transform, or `position: fixed` children (modals) break.
- `app/(dashboard)/template.tsx` fades each page in; `app/(dashboard)/loading.tsx` is the skeleton.
- Toasts: `const { fire } = useToast(); fire('Guardado', 'ok' | 'pr' | 'error' | 'info')` — provider is in `DashboardShell`.
- Never use `window.confirm`/`alert`; use `components/ui/ConfirmDialog.tsx`.
- New records open `RmCelebrationModal` (confetti on a new PR).

### Calendar and event readiness

- `lib/utils/readiness.ts` compares each event movement's load (for the athlete's category) with their records: 1RM, or an Epley estimate from a 2RM/3RM, or max reps for bodyweight. It returns a zone (Cómodo/Exigente/Al límite/Muy pesado/Sobre tu 1RM), reps possible and how to split the sets, plus an overall 0-100 score.
- An athlete in several boxes filters the calendar with `BoxFilter` (`apex.boxFilter` in localStorage); `/wod?box=` picks between several WODs of the same day.
- Animations use the `motion` package (`motion/react`): shared helpers in `components/ui/motion.tsx` (`Reveal`, `AnimatedNumber`, `Segmented`, `ActivePill`, `SPRING`, `EASE_OUT`). `MotionConfig reducedMotion="user"` is set in `DashboardShell`. `Modal` portals to `<body>` so transformed ancestors can't trap it. Performance rules: no `backdrop-blur` on sticky bars or cards (only the small tab bar and sheets, see Glass), no `filter: blur` glows (use radial gradients), no `layout` animations on lists that don't reorder, no per-item motion components in big grids (use CSS `animate-*`). The page transition is an opacity fade. Fonts come from `next/font` (Geist). `lib/supabase/session.ts` (`getUser`, `getProfile`, React `cache`) dedupes the user/profile lookups between the dashboard layout and the page. The service worker only handles page navigations.

### Security (009)

`next.config.ts` sends the security headers (CSP, HSTS, no framing, nosniff, referrer and permissions policy); a new external host (images, embeds, APIs) must be added to the CSP there. `009_security_hardening.sql`: boxes are readable only by their owner and members (the invite code was public), visitors without an account get only the public profile columns (never the email, so public pages must select explicit columns, not `*`), update policies have `with check`, owner/plan/email can't be changed from the app, storage buckets accept only JPEG/PNG/WebP up to 5 MB, and user text columns have length limits. Still to do in the Supabase dashboard: CAPTCHA on sign-in/sign-up, leaked-password protection, custom SMTP.

### UI rules (userinterface.wiki)

Labels are `text-xs font-semibold text-mu` in sentence case (no tiny uppercase tracking labels; uppercase is only for WOD-type badges). Weights stop at `font-bold`. Cards are flat `bg-p` with no border. Anything the person triggers animates in 300ms or less (press 120-180ms, entrances ease-out, exits ease-in and shorter, stagger 30ms per item); only data fills (rings, progress bars) may run longer. Every button gets a press scale from the base layer in `globals.css`; `.hit-44` widens a small icon button's touch area. The top bar title shrinks by length, nested screens get a back arrow (`Topbar`), and the bottom bar is user-editable (`apex.tabs.<mode>` in localStorage, `MobileNav`). Challenge exercises come from `lib/constants/challenge-exercises.ts` (category → subcategory → exercise).

### Brand

The logo is a plate seen from the front with the summit cut out (`components/ui/Logo.tsx`: `LogoMark` and `Logo`, colored by the text color). Files: `public/brand/` (SVG mark in lime/black/white, app icon, favicons), `public/icons/` (192, 512, maskable 512, apple-touch, one-colour notification badge) and `app/icon.svg` (tab icon). They are generated from one path; change the path in `Logo.tsx` and regenerate the PNGs with sharp if the mark ever changes.

### UI skill

`.claude/skills/userinterface-wiki/` (MIT, from raphaelsalaja/userinterface-wiki) holds 152 UI rules; review UI changes against it. Applied here: one shadow scale (`shadow-e1/e2/e3`, layered, tinted, top-down), exits shorter than entrances with ease-in, `mode="wait"` transitions at 150ms, hover shadows fade through a pseudo-element, tabular numbers on `font-display`.

### Glass, sounds and morphing icons

- The bottom bar (`MobileNav`) is a floating glass capsule (`.glass-bar`: the only always-on `backdrop-filter`, cheap because it is small); the active tab is an accent pill. Content needs `pb-[calc(96px+safe-area)]` and floating buttons sit at `bottom-[calc(88px+…)]` or higher.
- "Cristal" is a surface style next to mode and accent (`theme.surface`, `data-surface="glass"` on `<html>`, picked in Appearance). It is pure CSS at the end of `globals.css`: an ambient light behind the page, `.bg-p/.bg-p2/.bg-p3` become translucent panes, and sheets (`.glass-sheet` on `Modal`) blur what is behind. Cards are tinted, never blurred, so scrolling stays smooth; don't add `backdrop-filter` to cards or sticky headers.
- Sounds: `playSound(name)` from `lib/utils/sound.ts` (Web Audio, synthesized, no files). Already wired into toasts (ok/pr/error), `Switch`, `Segmented`, `Modal` open, tab changes and the calculator plates. Off switch in Appearance (`apex.sound`), silent with reduced motion; never play on typing.
- `components/ui/MorphIcon.tsx`: icons made of exactly three lines on a 14×14 grid that morph into each other (more/cross, play/pause, plus/cross, chevrons, arrows, check, menu). Used in the "Más" tab, timer start/pause, modal close and collapsible panels.
- Calendar: `WeekStrip` (seven days, selected in an outlined box, swipe for another week, week progress) or the month grid, then the selected day as a timeline by class time (`TimelineRow`).

### Notifications

In-app only (no push server). `app/(dashboard)/layout.tsx` builds notices with `buildNotices()` (`lib/utils/notifications.ts`): event countdown at 7/3/1/0 days, tomorrow's WOD with its class time, today's WOD still to log, new box events. `NotificationBell` (Topbar) shows them; read state and preferences live in localStorage. With permission, new notices also show as system notifications via the service worker while the app is open.

### Home widgets

Both homes use `components/home/WidgetBoard.tsx` (reorder, hide, restore; saved to `profiles.dashboard_layout` as `{ athlete: [...], coach: [...] }`, older saves were a bare athlete array). The coach home adds today's classes, box activity (14 days), athletes to win back (7+ days without a WOD) and challenges. `AthleteDashboard` renders a list of widgets (`hero`, `today`, `nextEvent`, `goals`, `week`, `highlights`, `strength`, `heatmap`, `records`, `stats`, `links`). The order/visibility is edited in place (`?edit=1` or "Personalizar", drag with `Reorder`) and saved to `profiles.dashboard_layout` (007) and localStorage. The hero ring (`HeroRings`) shows tiles the athlete picks in a visual gallery ("Editar"): muscle recovery per group (with `BodyFigure`), week, streak, event readiness, any 1RM, goals and joined challenges; choice saved in localStorage `apex.heroTiles`. Recovery comes from `lib/utils/movement-guide.ts` (movement → muscle groups, recovery hours) and opens "Generar WOD" (`lib/utils/wod-generator.ts`).

### Demo mode (temporary, remove before launch)

`/demo` sets the `apex_demo` cookie; `lib/supabase/server.ts` and `client.ts` then return a fake client (`lib/demo/*`) backed by an in-memory PostgREST-like engine with realistic seed data (`lib/demo/seed.ts`), shared between server and browser through `/demo/api`. Middleware skips auth for demo visitors. `/demo/exit` leaves. `components/demo/DemoTour.tsx` adds the orange demo bar (Atleta/Coach switch, Recorrido, exit) and a 15-step guided tour that can be closed and resumed (state in localStorage `apex.demoTour`; targets use `data-tour="..."`). To remove: delete `lib/demo`, `app/demo`, the demo lines in `lib/supabase/*.ts`, `middleware.ts`, `DashboardShell.tsx` and the "Ver la demo" link in `components/auth/WelcomeView.tsx`.

### Auth screens

Signed-out visitors land on `/welcome` (full-bleed photo carousel, "Crear cuenta", "Inicia sesión", "Ver la demo"). Login/register use a photo header layout (`app/auth/layout.tsx`). Photos are free Unsplash images listed in `lib/constants/photos.ts`.

### Joining a box

Use `joinBoxByCode()` from `lib/utils/join-box.ts`. It calls the `join_box_by_code` RPC, which validates the invite code server-side and always inserts the member as `athlete`.

---

## Realtime Architecture (WodView)

`components/wod/WodView.tsx` opens a single Supabase Realtime channel subscribed to both:
- `daily_wods` (filtered by `box_id=in.(...)`) — updates the displayed WOD instantly when coach publishes
- `wod_results` — refreshes the leaderboard when any athlete logs a result

The channel is created with `supabase.channel('wod-realtime')` and cleaned up in the `useEffect` return. The `wod?.id` dependency in the effect ensures the subscription updates if the WOD changes.

---

## Design System

### Tailwind Color Tokens

Defined in `tailwind.config.ts`. These are the only colors used throughout the app — never use raw hex values in components:

| Token | Value | Usage |
|---|---|---|
| `bg` | `#0a0c0f` | Page background |
| `p` | `#12161d` | Primary surface |
| `p2` | `#171c24` | Secondary surface |
| `p3` | `#1d242f` | Elevated surface / input bg |
| `ac` | `#c8f53e` | Accent (lime) — buttons, PRs, highlights |
| `bl` | `#6ec3f4` | Blue — EMOM, info |
| `gr` | `#4ade80` | Green — success, strength |
| `or` | `#fb923c` | Orange — ForTime |
| `rd` | `#fb7185` | Red — Tabata, danger, live indicator |
| `pu` | `#a78bfa` | Purple — AMRAP |
| `t` | `#eef0f3` | Primary text |
| `mu` | `#8a96a8` | Muted text |
| `fa` | `#50596a` | Faint text / labels |

**To redesign the visual:** update `tailwind.config.ts` token values + `app/globals.css` CSS variables. Component color classes will update automatically — do not touch individual component files for palette changes.

### WOD Type Badge Colors

```ts
const WOD_TYPE_COLORS = {
  fortime:  'text-or bg-or/10 border-or/20',
  amrap:    'text-ac bg-ac/10 border-ac/20',
  emom:     'text-bl bg-bl/10 border-bl/20',
  tabata:   'text-pu bg-pu/10 border-pu/20',
  strength: 'text-gr bg-gr/10 border-gr/20',
}
```

### Typography Rules

- **All headers, big numbers, WOD titles**: `font-display font-bold tracking-tight` (Geist), sentence case
- **Body, labels, inputs**: `font-sans` (Geist, the default)
- **Sheets/popups**: `Modal` (big title, round close button, drag down to close) + `ModalActions` (outlined secondary + filled primary pill)
- **Invite codes, monospace data**: add `tracking-widest` with `font-barlow`
- **Section labels**: `text-xs font-semibold text-mu`

### CSS Variables (globals.css)

```css
--ln:   border color (subtle)
--ln2:  border color (slightly more visible)
```

Used as `border-[var(--ln)]` in components when Tailwind tokens aren't sufficient.

---

## Multi-Tenancy

Each coach owns one box. Athletes belong to boxes via `box_members`. All data scoping happens at the RLS level — queries automatically filter to the authenticated user's boxes. The invite code flow:

1. Coach creates box → gets auto-generated `invite_code`
2. Coach shares code with athletes
3. Athlete enters code on register or `/auth/join-box` → row inserted into `box_members`

---

## Key Utilities

| File | Purpose |
|---|---|
| `lib/utils/rm-calculator.ts` | Epley formula (`weight × (1 + reps/30)`), plate calculator, percentage table |
| `lib/utils/units.ts` | lb ↔ kg conversion |
| `lib/utils/cn.ts` | `clsx` only (tailwind-merge is NOT installed — a className that conflicts with a component default does not reliably win) + `roleLabel()` |
| `lib/types/database.ts` | All TypeScript interfaces for DB tables + union types |

---

## Visual Redesign Guide (for Stitch/Design import)

When replacing the UI from a design tool export:

1. **Update palette first**: change token values in `tailwind.config.ts` and CSS variables in `app/globals.css`
2. **Update primitives**: `components/ui/Button.tsx`, `Card.tsx`, `Badge.tsx`, `Modal.tsx`
3. **Update layout chrome**: `Sidebar.tsx`, `MobileNav.tsx`, `Topbar.tsx`
4. **Update page-level components**: athlete/coach dashboards, WodView, PublishWodPanel
5. **Do not touch**: `lib/`, `app/auth/callback/`, `middleware.ts`, `public/sw.js` — these are logic-only

All Supabase queries, TypeScript types, and business logic live in `lib/` and page server components. They are completely decoupled from styling.

---

## Known Patterns to Follow

- **No Database generic on Supabase clients** — was removed to fix TypeScript inference. Use `as Type | null` casts.
- **Server component data fetching** — fetch in `page.tsx`, pass props to client components. Do not use `useEffect` + fetch for initial data.
- **`router.refresh()`** after mutations that change server-rendered data (e.g., after logging a WOD result).
- **`window.location.reload()`** is used in `WodResultModal.onSaved` as a pragmatic full refresh — acceptable for now.
- **Middleware** in `middleware.ts` protects all routes except `/`, `/auth/*`, and static assets.
