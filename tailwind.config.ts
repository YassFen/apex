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
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        barlow: ['"Barlow Condensed"', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
      },
    },
  },
  plugins: [],
}
export default config
