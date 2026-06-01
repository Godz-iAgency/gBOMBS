/**
 * Curated preset food lists per gBOMBS category. These populate the chip grid on
 * the FoodPreferenceScreen. All preset foods are pre-validated (is_validated=TRUE,
 * source='preset') when saved to Supabase.
 *
 * Rules: whole foods only, nothing processed. Dr. Sebi alkaline diet informed.
 * Tofu and tempeh removed (processed). Edamame stays (whole soybean = whole food).
 */
export const GBOMBS_PRESETS = {
  greens: [
    'Kale', 'Spinach', 'Arugula', 'Collard greens',
    'Watercress', 'Dandelion greens', 'Amaranth greens',
    'Romaine', 'Mustard greens', 'Swiss chard', 'Beet greens',
  ],
  beans: [
    'Black beans', 'Lentils', 'Chickpeas', 'Edamame',
    'Kidney beans', 'Pinto beans', 'Navy beans',
    'Split peas', 'Mung beans', 'Black-eyed peas',
  ],
  onion: [
    'Garlic', 'Red onion', 'Yellow onion', 'Escallion',
    'Leeks', 'Shallots', 'Chives', 'Spring onions',
    'White onion', 'Ramps',
  ],
  mushroom: [
    'Portobello', 'Shiitake', 'Cremini', 'Oyster',
    'Maitake', "Lion's mane", 'Chanterelle',
    'Button', 'Reishi', 'Porcini',
  ],
  berries: [
    'Blueberries', 'Raspberries', 'Blackberries', 'Elderberries',
    'Mulberries', 'Goji berries', 'Strawberries',
    'Acai', 'Currants', 'Cherries',
  ],
  seeds: [
    'Walnuts', 'Chia seeds', 'Flaxseeds', 'Hemp seeds',
    'Brazil nuts', 'Pumpkin seeds', 'Sunflower seeds',
    'Almonds', 'Sesame seeds', 'Quinoa',
  ],
} as const;

/** The six gBOMBS categories in display order, with labels + brand colors. */
export const GBOMBS_CATEGORIES = [
  { key: 'greens', letter: 'G', label: 'GREENS', color: '#16A34A', addPlaceholder: 'Add your own green…' },
  { key: 'beans', letter: 'B', label: 'BEANS', color: '#92400E', addPlaceholder: 'Add your own bean…' },
  { key: 'onion', letter: 'O', label: 'ONION', color: '#7C3AED', addPlaceholder: 'Add your own allium…' },
  { key: 'mushroom', letter: 'M', label: 'MUSHROOM', color: '#B45309', addPlaceholder: 'Add your own mushroom…' },
  { key: 'berries', letter: 'B', label: 'BERRIES', color: '#BE185D', addPlaceholder: 'Add your own berry…' },
  { key: 'seeds', letter: 'S', label: 'SEEDS & NUTS', color: '#CA8A04', addPlaceholder: 'Add your own seed or nut…' },
] as const;

export type GBombsCategoryKey = keyof typeof GBOMBS_PRESETS;
