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
  // `color` = solid badge color (logo-true). `chip` = brighter on-dark variant
  // used for selected chip text/border so it stays readable on the black bg.
  { key: 'greens', letter: 'G', label: 'GREENS', color: '#3A6B2A', chip: '#6FBF4A', addPlaceholder: 'Add your own green…' },
  { key: 'beans', letter: 'B', label: 'BEANS', color: '#6B4423', chip: '#C08B4F', addPlaceholder: 'Add your own bean…' },
  { key: 'onion', letter: 'O', label: 'ONION', color: '#8B2252', chip: '#D85A8E', addPlaceholder: 'Add your own allium…' },
  { key: 'mushroom', letter: 'M', label: 'MUSHROOM', color: '#9B7232', chip: '#D4A84E', addPlaceholder: 'Add your own mushroom…' },
  { key: 'berries', letter: 'B', label: 'BERRIES', color: '#3D2F7A', chip: '#8A7BD8', addPlaceholder: 'Add your own berry…' },
  { key: 'seeds', letter: 'S', label: 'SEEDS & NUTS', color: '#9B8C3A', chip: '#D4C24E', addPlaceholder: 'Add your own seed or nut…' },
] as const;

export type GBombsCategoryKey = keyof typeof GBOMBS_PRESETS;
