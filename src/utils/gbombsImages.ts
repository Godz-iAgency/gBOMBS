/**
 * Central registry for gBOMBS food-letter images + the full wordmark logo.
 * Files live in assets/images/logo/ (note: saved with double .png.png extension).
 *
 * Each letter has its food-group hex (logo-true `color`) and a brighter on-dark
 * `glow` variant used for borders/shadows/text so it pops on the black bg.
 */
import type { ImageSourcePropType } from 'react-native';
import type { GBombsCategoryKey } from './gbombsPresets';

export const LOGO_WITH_BG: ImageSourcePropType = require('../../assets/images/logo/G-bombs logo with background.png');
export const LOGO_NO_BG: ImageSourcePropType = require('../../assets/images/logo/G-bombs logo no background.png');

export type GBombsLetterMeta = {
  key: GBombsCategoryKey;
  letter: string;
  word: string;
  color: string; // logo-true food color
  glow: string; // brighter on-dark variant
  image: ImageSourcePropType;
};

export const GBOMBS_LETTERS: GBombsLetterMeta[] = [
  {
    key: 'greens',
    letter: 'G',
    word: 'Greens',
    color: '#3A6B2A',
    glow: '#6FBF4A',
    image: require('../../assets/images/logo/G-greens.png.png'),
  },
  {
    key: 'beans',
    letter: 'B',
    word: 'Beans',
    color: '#6B4423',
    glow: '#C08B4F',
    image: require('../../assets/images/logo/B-beans.png.png'),
  },
  {
    key: 'onion',
    letter: 'O',
    word: 'Onion',
    color: '#8B2252',
    glow: '#D85A8E',
    image: require('../../assets/images/logo/O-onion.png.png'),
  },
  {
    key: 'mushroom',
    letter: 'M',
    word: 'Mushroom',
    color: '#9B7232',
    glow: '#D4A84E',
    image: require('../../assets/images/logo/M-mushroom.png.png'),
  },
  {
    key: 'berries',
    letter: 'B',
    word: 'Berries',
    color: '#3D2F7A',
    glow: '#8A7BD8',
    image: require('../../assets/images/logo/B-berries.png.png'),
  },
  {
    key: 'seeds',
    letter: 'S',
    word: 'Seeds & Nuts',
    color: '#9B8C3A',
    glow: '#D4C24E',
    image: require('../../assets/images/logo/S-seeds.png.png'),
  },
];

/** Quick lookup by category key. */
export const LETTER_BY_KEY: Record<GBombsCategoryKey, GBombsLetterMeta> =
  Object.fromEntries(GBOMBS_LETTERS.map((l) => [l.key, l])) as Record<
    GBombsCategoryKey,
    GBombsLetterMeta
  >;
