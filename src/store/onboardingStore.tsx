import React, { createContext, useContext, useMemo, useState } from 'react';
import type {
  DietMode,
  HealthGoal,
  CookingStyle,
} from '@/types/database.types';

/**
 * In-memory store for selections made during the 7-step onboarding flow. Lives
 * for the duration of the onboarding session. Individual steps also persist to
 * Supabase as the user advances, so this is primarily for cross-screen UI state.
 */
type OnboardingState = {
  dietMode: DietMode;
  healthGoal: HealthGoal | null;
  cookingStyle: CookingStyle | null;
  setDietMode: (m: DietMode) => void;
  setHealthGoal: (g: HealthGoal) => void;
  setCookingStyle: (c: CookingStyle) => void;
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingState | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [dietMode, setDietMode] = useState<DietMode>('vegan');
  const [healthGoal, setHealthGoal] = useState<HealthGoal | null>(null);
  const [cookingStyle, setCookingStyle] = useState<CookingStyle | null>(null);

  const value = useMemo<OnboardingState>(
    () => ({
      dietMode,
      healthGoal,
      cookingStyle,
      setDietMode,
      setHealthGoal,
      setCookingStyle,
      reset: () => {
        setDietMode('vegan');
        setHealthGoal(null);
        setCookingStyle(null);
      },
    }),
    [dietMode, healthGoal, cookingStyle]
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx)
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  return ctx;
}
