/**
 * Expanded per-category gBOMBS food library — the "See more options" browse
 * list on FoodPreferenceScreen. A superset of GBOMBS_PRESETS (the small
 * starter chip grid): same whole-food, unprocessed, category-fit criteria as
 * the Gemini validator (Prompt 8), just a longer curated list so someone who
 * wants more than the default ~10 chips has somewhere to look instead of
 * typing and risking a rejection.
 *
 * Compiled from general nutrition/botanical knowledge, not copied from any
 * single published source — the gBOMBS categories (Greens, Beans, Onions,
 * Mushrooms, Berries, Seeds) are a well-known nutritional framework, not
 * proprietary content.
 */
import type { GBombsCategoryKey } from './gbombsPresets';

export const GBOMBS_LIBRARY: Record<GBombsCategoryKey, string[]> = {
  greens: [
    'Kale', 'Spinach', 'Arugula', 'Collard greens', 'Watercress',
    'Dandelion greens', 'Amaranth greens', 'Romaine', 'Mustard greens',
    'Swiss chard', 'Beet greens', 'Bok choy', 'Turnip greens', 'Escarole',
    'Endive', 'Sorrel', 'Broccoli rabe', 'Chicory greens', 'Tatsoi',
    'Mizuna', 'Frisée', 'Spring mix', 'Baby kale',
  ],
  beans: [
    'Black beans', 'Lentils', 'Chickpeas', 'Edamame', 'Kidney beans',
    'Pinto beans', 'Navy beans', 'Split peas', 'Mung beans',
    'Black-eyed peas', 'Great Northern beans', 'Cannellini beans',
    'Fava beans', 'Lima beans', 'Adzuki beans', 'Soybeans', 'Butter beans',
    'Red lentils', 'Green lentils', 'French lentils', 'Yellow split peas',
    'Black soybeans', 'Borlotti beans', 'Flageolet beans',
  ],
  onion: [
    'Garlic', 'Red onion', 'Yellow onion', 'Escallion', 'Leeks',
    'Shallots', 'Chives', 'Spring onions', 'White onion', 'Ramps',
    'Sweet onion', 'Pearl onions', 'Green onions', 'Elephant garlic',
    'Wild garlic', 'Garlic chives', 'Onion sprouts', 'Cipollini onions',
  ],
  mushroom: [
    'Portobello', 'Shiitake', 'Cremini', 'Oyster', 'Maitake',
    "Lion's mane", 'Chanterelle', 'Button', 'Reishi', 'Porcini',
    'King oyster', 'Enoki', 'Beech mushroom', 'Wood ear', 'Morel',
    'Turkey tail', 'Black trumpet', 'Hedgehog mushroom', 'Baby bella',
    'Chestnut mushroom',
  ],
  berries: [
    'Blueberries', 'Raspberries', 'Blackberries', 'Elderberries',
    'Mulberries', 'Goji berries', 'Strawberries', 'Acai', 'Currants',
    'Cherries', 'Cranberries', 'Boysenberries', 'Gooseberries',
    'Lingonberries', 'Huckleberries', 'Bilberries', 'Pomegranate',
    'Grapes', 'Sea buckthorn berries', 'Honeyberries',
  ],
  seeds: [
    'Walnuts', 'Chia seeds', 'Flaxseeds', 'Hemp seeds', 'Brazil nuts',
    'Pumpkin seeds', 'Sunflower seeds', 'Almonds', 'Sesame seeds', 'Quinoa',
    'Cashews', 'Pistachios', 'Pecans', 'Macadamia nuts', 'Hazelnuts',
    'Pine nuts', 'Poppy seeds', 'Watermelon seeds', 'Amaranth seeds',
    'Buckwheat',
  ],
};
