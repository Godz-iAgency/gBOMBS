/**
 * Curated preset food lists per gBOMBS category. These populate the chip grid on
 * the FoodPreferenceScreen. All preset foods are pre-validated (is_validated=TRUE,
 * source='preset') when saved to Supabase.
 */
export const GBOMBS_PRESETS = {
  greens: [
    'Kale', 'Spinach', 'Arugula', 'Swiss chard',
    'Collard greens', 'Bok choy', 'Romaine',
    'Watercress', 'Mustard greens', 'Beet greens',
  ],
  beans: [
    'Black beans', 'Lentils', 'Chickpeas', 'Edamame',
    'Kidney beans', 'Tofu', 'Tempeh', 'Pinto beans',
    'Navy beans', 'Split peas', 'Mung beans',
  ],
  onion: [
    'Garlic', 'Red onion', 'Yellow onion', 'Leeks',
    'Shallots', 'Chives', 'Scallions', 'White onion',
  ],
  mushroom: [
    'Portobello', 'Shiitake', 'Cremini', 'Oyster',
    'Button', 'Maitake', "Lion's mane", 'Reishi',
  ],
  berries: [
    'Blueberries', 'Raspberries', 'Strawberries', 'Blackberries',
    'Goji berries', 'Acai', 'Cranberries', 'Mulberries',
  ],
  seeds: [
    'Chia seeds', 'Flaxseeds', 'Walnuts', 'Pumpkin seeds',
    'Sunflower seeds', 'Almonds', 'Hemp seeds', 'Brazil nuts',
    'Cashews', 'Pecans', 'Sesame seeds', 'Pine nuts',
  ],
} as const;

/** The six gBOMBS categories in display order, with labels + brand colors. */
export const GBOMBS_CATEGORIES = [
  { key: 'greens', letter: 'G', label: 'GREENS', color: '#16A34A', addPlaceholder: 'Add your own green…' },
  { key: 'beans', letter: 'B', label: 'BEANS', color: '#92400E', addPlaceholder: 'Add your own bean…' },
  { key: 'onion', letter: 'O', label: 'ONION', color: '#7C3AED', addPlaceholder: 'Add your own allium…' },
  { key: 'mushroom', letter: 'M', label: 'MUSHROOM', color: '#B45309', addPlaceholder: 'Add your own mushroom…' },
  { key: 'berries', letter: 'B', label: 'BERRIES', color: '#BE185D', addPlaceholder: 'Add your own berry…' },
  { key: 'seeds', letter: 'S', label: 'SEEDS & NUTS', color: '#CA8A04', addPlaceholder: 'Add your own seed…' },
] as const;

export type GBombsCategoryKey = keyof typeof GBOMBS_PRESETS;
