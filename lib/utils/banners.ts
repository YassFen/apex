// Home banners: the looks an administrator can pick, and the rules for where a banner may lead.
import {
  Megaphone, Flame, CalendarCheck, Trophy, Flag, Gift, Star, Lightning, Heart, Barbell, Ticket, UsersThree, Info, Sparkle, Timer, ShoppingBag,
} from '@/components/ui/icons'

export interface Banner {
  id: string; box_id: string | null; title: string; body: string | null; cta_label: string | null; href: string | null
  tone: BannerTone; icon: string; image_url: string | null; audience: 'all' | 'athletes' | 'coaches'
  starts_on: string; ends_on: string | null; position: number; dismissible: boolean; is_active: boolean; views: number; clicks: number; created_at: string
}

export type BannerTone = 'accent' | 'blue' | 'green' | 'orange' | 'red' | 'purple' | 'dark'

/** Background, text and button classes per look. Text on a colored banner is always dark or white, never the series color. */
export const BANNER_TONES: Record<BannerTone, { label: string; card: string; sub: string; cta: string; swatch: string }> = {
  accent: { label: 'Acento', card: 'bg-ac text-onac', sub: 'text-onac/75', cta: 'bg-onac text-ac', swatch: 'bg-ac' },
  blue:   { label: 'Azul', card: 'bg-bl text-black', sub: 'text-black/70', cta: 'bg-black text-white', swatch: 'bg-bl' },
  green:  { label: 'Verde', card: 'bg-gr text-black', sub: 'text-black/70', cta: 'bg-black text-white', swatch: 'bg-gr' },
  orange: { label: 'Naranja', card: 'bg-or text-black', sub: 'text-black/70', cta: 'bg-black text-white', swatch: 'bg-or' },
  red:    { label: 'Rojo', card: 'bg-rd text-white', sub: 'text-white/80', cta: 'bg-white text-black', swatch: 'bg-rd' },
  purple: { label: 'Violeta', card: 'bg-pu text-black', sub: 'text-black/70', cta: 'bg-black text-white', swatch: 'bg-pu' },
  dark:   { label: 'Sobrio', card: 'bg-p2 text-t', sub: 'text-mu', cta: 'bg-ac text-onac', swatch: 'bg-p3' },
}

export const BANNER_ICONS = {
  megaphone: Megaphone, flame: Flame, calendar: CalendarCheck, trophy: Trophy, flag: Flag, gift: Gift, star: Star, bolt: Lightning,
  heart: Heart, barbell: Barbell, ticket: Ticket, people: UsersThree, info: Info, sparkle: Sparkle, timer: Timer, shop: ShoppingBag,
} as const
export type BannerIcon = keyof typeof BANNER_ICONS

/** Screens an administrator can send people to without typing an address. */
export const BANNER_LINKS: { href: string; label: string }[] = [
  { href: '/classes', label: 'Clases y reservas' }, { href: '/wod', label: 'WOD del día' }, { href: '/challenges', label: 'Retos' },
  { href: '/calendar', label: 'Calendario' }, { href: '/competitions', label: 'Competencias' }, { href: '/announcements', label: 'Avisos' },
  { href: '/prs', label: 'Récords' }, { href: '/movements', label: 'Ejercicios' }, { href: '/settings/boxes', label: 'Mis boxes' },
]

/** Only a screen of the app or a full https address; anything else (javascript:, //host, data:) is dropped. */
export function safeHref(raw: string | null | undefined): string | null {
  const v = (raw ?? '').trim()
  if (!v) return null
  if (/^\/[^/\\]/.test(v)) return v
  if (/^https:\/\/[^\s]+$/i.test(v)) return v
  return null
}
export const isExternal = (href: string) => href.startsWith('https://')

export const isBannerLive = (b: Pick<Banner, 'is_active' | 'starts_on' | 'ends_on'>, today: string) => b.is_active && b.starts_on <= today && (!b.ends_on || b.ends_on >= today)
