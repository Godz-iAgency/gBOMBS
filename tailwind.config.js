/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './index.ts', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ---- gBOMBS brand (colors pulled from the food-letter logo) ----
        brand: {
          green: '#3A6B2A', // G — Kale/Greens — dominant primary
          greenBright: '#5A9A3A', // lighter leaf green for highlights/glows
          beans: '#2A1508', // B — Beans/Lentils — dark espresso brown
          onion: '#8B2252', // O — Red Onion — crimson purple
          mushroom: '#9B7232', // M — Mushroom — warm amber caramel
          berries: '#2D2060', // B — Berries — deep blue-purple
          gold: '#9B8C3A', // S — Seeds/Nuts — golden olive (secondary accent)
          orange: '#F97316', // legacy accent (kept for compatibility)
        },
        surface: {
          DEFAULT: '#0A0A0A', // near-black warm dark (app background)
          card: '#161616', // slightly warm charcoal card
          cardAlt: '#1F1B14', // warm-tinted card for richer sections
          border: '#2D2D2D', // chip / divider border
        },
        content: {
          DEFAULT: '#F5F5F0', // text primary (warm white)
          muted: '#A8A29E', // text secondary (warm grey)
        },
        // ---- gBOMBS category colors (used for dots, tags, icons) ----
        gbombs: {
          greens: '#3A6B2A',
          beans: '#6B4423', // beans rendered lighter so it reads on dark bg
          onion: '#8B2252',
          mushroom: '#9B7232',
          berries: '#3D2F7A', // berries lightened slightly for contrast
          seeds: '#9B8C3A',
        },
      },
    },
  },
  plugins: [],
};
