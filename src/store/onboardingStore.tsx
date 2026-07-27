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
  state: string;
  city: string;
  zipCode: string;
  dietMode: DietMode;
  healthGoal: HealthGoal | null;
  /** Optional second focus area — up to 2 goals total during onboarding. */
  healthGoalSecondary: HealthGoal | null;
  cookingStyle: CookingStyle | null;
  setState: (s: string) => void;
  setCity: (c: string) => void;
  setZipCode: (z: string) => void;
  setDietMode: (m: DietMode) => void;
  setHealthGoal: (g: HealthGoal | null) => void;
  setHealthGoalSecondary: (g: HealthGoal | null) => void;
  setCookingStyle: (c: CookingStyle) => void;
  reset: () => void;
};

const OnboardingContext = createContext<OnboardingState | undefined>(undefined);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState('');
  const [city, setCity] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [dietMode, setDietMode] = useState<DietMode>('vegan');
  const [healthGoal, setHealthGoal] = useState<HealthGoal | null>(null);
  const [healthGoalSecondary, setHealthGoalSecondary] =
    useState<HealthGoal | null>(null);
  const [cookingStyle, setCookingStyle] = useState<CookingStyle | null>(null);

  const value = useMemo<OnboardingState>(
    () => ({
      state,
      city,
      zipCode,
      dietMode,
      healthGoal,
      healthGoalSecondary,
      cookingStyle,
      setState,
      setCity,
      setZipCode,
      setDietMode,
      setHealthGoal,
      setHealthGoalSecondary,
      setCookingStyle,
      reset: () => {
        setState('');
        setCity('');
        setZipCode('');
        setDietMode('vegan');
        setHealthGoal(null);
        setHealthGoalSecondary(null);
        setCookingStyle(null);
      },
    }),
    [state, city, zipCode, dietMode, healthGoal, healthGoalSecondary, cookingStyle]
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
