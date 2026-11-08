import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Every color is a CSS variable (RGB channels) defined in app/globals.css,
        // so light/dark mode and the accent theme switch without touching components.
        bg:   'rgb(var(--c-bg) / <alpha-value>)',   // Page background
        p:    'rgb(var(--c-p) / <alpha-value>)',    // Primary surface (cards)
        p2:   'rgb(var(--c-p2) / <alpha-value>)',   // Secondary surface (inputs, cards on cards)
        p3:   'rgb(var(--c-p3) / <alpha-value>)',   // Elevated surface (hover, selected)

        ac:   'rgb(var(--c-ac) / <alpha-value>)',   // Accent: main CTA, PRs, highlights (user-selectable)
        onac: 'rgb(var(--c-onac) / <alpha-value>)', // Text/icons on top of the accent

        bl:   'rgb(var(--c-bl) / <alpha-value>)',   // Blue — info / EMOM
        gr:   'rgb(var(--c-gr) / <alpha-value>)',   // Green — success / strength
        or:   'rgb(var(--c-or) / <alpha-value>)',   // Orange — For Time
        rd:   'rgb(var(--c-rd) / <alpha-value>)',   // Red — danger / live
        pu:   'rgb(var(--c-pu) / <alpha-value>)',   // Purple — AMRAP

        t:    'rgb(var(--c-t) / <alpha-value>)',    // Primary text
        mu:   'rgb(var(--c-mu) / <alpha-value>)',   // Muted text
        fa:   'rgb(var(--c-fa) / <alpha-value>)',   // Faint text (labels, placeholders)

        // Physical bumper-plate colors (IWF standard). Fixed on purpose: they must
        // look like the real plates in every theme.
        plate: {
          red:    '#d62f2f',
          blue:   '#2563eb',
          yellow: '#e8b10c',
          green:  '#16a34a',
          white:  '#e8e8ea',
          black:  '#26272b',
          steel:  '#8b9099',
        },
      },
      fontFamily: {
        // One modern sans for everything (SF-like). Display = headings and big numbers.
        // Geist is self-hosted by next/font (app/layout.tsx) and exposed as --font-geist.
        sans: ['var(--font-geist)', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['var(--font-geist)', 'system-ui', '-apple-system', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
      },
    },
  },
  plugins: [],
}
export default config
