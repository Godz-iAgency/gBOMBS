import type { ImageSourcePropType } from 'react-native';
import type { GBombsCategoryKey } from './gbombsPresets';

// General nutrient education, kept local so opening a tile never calls AI.
// Nutrition references are recorded with the assets in plant-groups/PROMPTS.md.
export const PLANT_DETAILS: Record<GBombsCategoryKey, {
  image: ImageSourcePropType;
  benefit: string;
}> = {
  greens: {
    image: require('../../assets/images/plant-groups/greens.jpg'),
    benefit: 'Vitamin A supports vision; fiber supports healthy digestion.',
  },
  beans: {
    image: require('../../assets/images/plant-groups/beans.jpg'),
    benefit: 'Plant protein supports muscles; fiber supports healthy digestion.',
  },
  onion: {
    image: require('../../assets/images/plant-groups/onion.jpg'),
    benefit: 'Fiber supports digestion; vitamin C supports immune function.',
  },
  mushroom: {
    image: require('../../assets/images/plant-groups/mushroom.jpg'),
    benefit: 'Potassium helps your muscles and nerves work normally.',
  },
  berries: {
    image: require('../../assets/images/plant-groups/berries.jpg'),
    benefit: 'Vitamin C supports immunity; fiber supports healthy digestion.',
  },
  seeds: {
    image: require('../../assets/images/plant-groups/seeds.jpg'),
    benefit: 'Plant protein and unsaturated fats help round out a balanced diet.',
  },
};
