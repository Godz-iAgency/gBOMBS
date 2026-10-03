import type { ImageSourcePropType } from 'react-native';
import type { MealSlot } from '@/services/gemini';

/** Decorative artwork for each meal slot, shared across all weekly plans. */
export const MEAL_WALLPAPERS: Record<MealSlot, ImageSourcePropType> = {
  smoothie: require('../../assets/images/meal-wallpapers/smoothie.jpg'),
  breakfast: require('../../assets/images/meal-wallpapers/breakfast.jpg'),
  lunch: require('../../assets/images/meal-wallpapers/lunch.jpg'),
  dinner: require('../../assets/images/meal-wallpapers/dinner.jpg'),
  dessert: require('../../assets/images/meal-wallpapers/dessert.jpg'),
};
