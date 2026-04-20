import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:  '#0a0c0f',
        p:   '#12161d',
        p2:  '#171c24',
        p3:  '#1d242f',
        ac:  '#c8f53e',
        bl:  '#6ec3f4',
        gr:  '#4ade80',
        or:  '#fb923c',
        rd:  '#fb7185',
        pu:  '#a78bfa',
        t:   '#eef0f3',
        mu:  '#8a96a8',
        fa:  '#50596a',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        barlow: ['"Barlow Condensed"', 'sans-serif'],
      },
      borderRadius: {
        card: '18px',
      },
      backgroundImage: {
        'card-grad': 'linear-gradient(160deg, #12161d 0%, #171c24 100%)',
      },
    },
  },
  plugins: [],
}
export default config
