/**
 * Single-select option metadata for the editable profile settings (diet mode,
 * health goal, cooking style). Mirrors the choices offered during onboarding so
 * the Profile editors look and read identically — same icons, colors, copy.
 */

import type { Ionicons } from '@expo/vector-icons';
import type { DietMode, HealthGoal, CookingStyle } from '@/types/database.types';

type IconName = keyof typeof Ionicons.glyphMap;

export interface PlanOption<T extends string> {
  key: T;
  icon: IconName;
  color: string;
  title: string;
  desc: string;
}

export const DIET_MODES: PlanOption<DietMode>[] = [
  {
    key: 'vegan',
    icon: 'leaf',
    color: '#3A6B2A',
    title: 'Vegan',
    desc: '100% plant-based. No eggs, dairy, meat, or fish.',
  },
  {
    key: 'vegetarian',
    icon: 'egg',
    color: '#D4A84E',
    title: 'Vegetarian',
    desc: 'Plant-based, but eggs and cheese are allowed. No meat or fish.',
  },
];

export const HEALTH_GOALS: PlanOption<HealthGoal>[] = [
  { key: 'weight_loss', icon: 'trending-down', color: '#6FBF4A', title: 'Weight loss', desc: 'Lower-calorie, high-satiety meals' },
  { key: 'gut_health', icon: 'leaf', color: '#3A6B2A', title: 'Gut health', desc: 'Fiber-rich, fermented, microbiome-friendly' },
  { key: 'energy', icon: 'flash', color: '#D4A84E', title: 'Energy', desc: 'Steady fuel through the day' },
  { key: 'anti_inflammatory', icon: 'shield-checkmark', color: '#8A7BD8', title: 'Anti-inflammatory', desc: 'Antioxidant-dense, healing foods' },
  { key: 'general_wellness', icon: 'sparkles', color: '#D85A8E', title: 'General wellness', desc: 'A balanced, everyday approach' },
];

export const COOKING_STYLES: PlanOption<CookingStyle>[] = [
  { key: 'quick_simple', icon: 'flash', color: '#D4A84E', title: 'Quick & simple', desc: '15–20 min meals, minimal steps' },
  { key: 'balanced_everyday', icon: 'restaurant', color: '#6FBF4A', title: 'Balanced everyday', desc: 'A practical mix for weeknights' },
  { key: 'gourmet_weekend', icon: 'wine', color: '#D85A8E', title: 'Gourmet weekend', desc: 'More involved, restaurant-style' },
  { key: 'batch_cooking', icon: 'layers', color: '#8A7BD8', title: 'Batch cooking', desc: 'Cook once, eat all week' },
];

/** Build a key→title map from an option list, for compact summary rows. */
function labelMap<T extends string>(opts: PlanOption<T>[]): Record<T, string> {
  return opts.reduce(
    (acc, o) => {
      acc[o.key] = o.title;
      return acc;
    },
    {} as Record<T, string>
  );
}

export const DIET_LABEL = labelMap(DIET_MODES);
export const GOAL_LABEL = labelMap(HEALTH_GOALS);
export const STYLE_LABEL = labelMap(COOKING_STYLES);
