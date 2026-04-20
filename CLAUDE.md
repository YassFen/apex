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
| Fonts | Inter (body) + Barlow Condensed (headings/numbers) |
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
│   └── callback/route.ts           # Supabase OAuth callback handler
└── (dashboard)/
    ├── layout.tsx                  # Server component: verifies auth, fetches profile, wraps DashboardShell
    ├── dashboard/page.tsx          # Branches: CoachDashboard or AthleteDashboard based on profile.role
    ├── wod/page.tsx                # Athlete: live WOD view
    ├── prs/page.tsx                # Athlete: personal records
    ├── timer/page.tsx              # Timer (all users)
    ├── calc/page.tsx               # 1RM Calculator (all users)
    ├── benchmarks/page.tsx         # Athlete: benchmark results
    ├── coach/publish-wod/page.tsx  # Coach: publish/edit today's WOD
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

### Key RLS Helpers (PostgreSQL functions)

```sql
public.is_box_member(p_box_id uuid) → boolean
public.is_box_coach(p_box_id uuid) → boolean
```

These are used throughout all RLS policies. An athlete sees WODs/results only for boxes they belong to.

### Realtime Setup

`daily_wods` and `wod_results` must be added to the `supabase_realtime` publication via **Supabase Dashboard → Database → Publications**. This cannot be done via SQL (free plan restriction).

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

- **All headers, big numbers, WOD titles**: `font-barlow font-black` (Barlow Condensed Black)
- **Body, labels, inputs**: `font-sans` (Inter, the default)
- **Invite codes, monospace data**: add `tracking-widest` with `font-barlow`
- **Section labels**: `text-[10px] uppercase tracking-[1.6px] text-fa font-bold`

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
| `lib/utils/cn.ts` | `clsx` + `tailwind-merge` className utility |
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
