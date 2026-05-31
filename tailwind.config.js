/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './index.ts', './src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // ---- gBOMBS brand ----
        brand: {
          green: '#22C55E', // Electric Green (primary)
          orange: '#F97316', // Electric Orange (accent)
        },
        surface: {
          DEFAULT: '#0A0A0A', // Deep Matte Black (app background)
          card: '#1A1A1A', // Dark Charcoal (card background)
          border: '#2D2D2D', // chip / divider border
        },
        content: {
          DEFAULT: '#FFFFFF', // text primary
          muted: '#9CA3AF', // text secondary
        },
        // ---- gBOMBS category colors ----
        gbombs: {
          greens: '#16A34A', // forest green
          beans: '#92400E', // earthy brown
          onion: '#7C3AED', // deep purple
          mushroom: '#B45309', // warm amber
          berries: '#BE185D', // deep rose
          seeds: '#CA8A04', // golden
        },
      },
    },
  },
  plugins: [],
};
