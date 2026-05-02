import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Pure Black Minimal palette (inspired by Hevy / Dropset / Train Fitness) ──
        // Backgrounds: separated by tone, not by border lines
        bg:  '#000000',  // Page background — pure black
        p:   '#0E0E0E',  // Primary surface (cards on bg)
        p2:  '#1A1A1A',  // Secondary surface (cards on cards / inputs)
        p3:  '#242424',  // Elevated surface (hover, active states)

        // Accent — used SPARINGLY, only for primary CTAs and key highlights
        ac:  '#C8F53E',  // Lime (kept as brand accent for PRs and main CTA)

        // Semantic colors — used only where needed (badges, indicators)
        bl:  '#6EC3F4',  // Blue — info / EMOM
        gr:  '#4ADE80',  // Green — success / strength
        or:  '#FB923C',  // Orange — ForTime
        rd:  '#FB7185',  // Red — danger / live
        pu:  '#A78BFA',  // Purple — AMRAP

        // Text scale — high contrast on pure black
        t:   '#FFFFFF',  // Primary text (was #eef0f3 → pure white for max contrast)
        mu:  '#9E9E9E',  // Muted text (secondary info)
        fa:  '#5A5A5A',  // Faint text (labels, placeholders)
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        barlow: ['"Barlow Condensed"', 'sans-serif'],
      },
      borderRadius: {
        card: '20px',
      },
      backgroundImage: {
        // Cards no longer use gradient — flat surface
        'card-grad': 'linear-gradient(160deg, #0E0E0E 0%, #1A1A1A 100%)',
      },
    },
  },
  plugins: [],
}
export default config
