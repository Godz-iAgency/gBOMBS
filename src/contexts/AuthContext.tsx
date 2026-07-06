import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  registerForPushNotifications,
  clearPushToken,
} from '@/lib/notifications';

/** Minimal profile shape the navigator needs to gate routing. */
type Profile = {
  full_name: string | null;
  onboarding_completed: boolean;
  subscription_tier: string;
  subscription_status: string;
  // Real Stripe subscription id. Null for the free DB-default trial, so the
  // gate uses this to tell a paid/trialing subscriber from a brand-new user.
  subscription_id: string | null;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean; // session bootstrap
  profileLoading: boolean; // profile fetch in flight
  // True when this account is an ACTIVE professional for at least one client.
  // Drives the pure-professional routing (a professional with no personal
  // subscription gets the stripped clients-only app, not the paywall).
  isProfessional: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [isProfessional, setIsProfessional] = useState(false);

  const fetchProfile = useCallback(async (userId: string) => {
    setProfileLoading(true);
    // Profile + "am I an active professional?" in parallel — both gate routing.
    const [{ data, error }, { count }] = await Promise.all([
      supabase
        .from('users')
        .select(
          'full_name, onboarding_completed, subscription_tier, subscription_status, subscription_id'
        )
        .eq('id', userId)
        .single(),
      supabase
        .from('professional_connections')
        .select('id', { count: 'exact', head: true })
        .eq('professional_id', userId)
        .eq('status', 'active'),
    ]);
    if (!error && data) setProfile(data as Profile);
    setIsProfessional((count ?? 0) > 0);
    setProfileLoading(false);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  useEffect(() => {
    // Restore any persisted session on launch.
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    // Keep state in sync with sign-in / sign-out / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // Load (or clear) the profile whenever the signed-in user changes.
  useEffect(() => {
    if (session?.user) {
      fetchProfile(session.user.id);
      // Register for the daily-reminder push (best-effort; prompts for
      // permission the first time, no-ops on web/simulator or if denied).
      registerForPushNotifications(session.user.id);
    } else {
      setProfile(null);
      setIsProfessional(false);
    }
  }, [session?.user?.id, fetchProfile]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      profileLoading,
      isProfessional,
      refreshProfile,
      signOut: async () => {
        // Stop this device from receiving pushes once signed out.
        if (session?.user) await clearPushToken(session.user.id);
        await supabase.auth.signOut();
      },
    }),
    [session, profile, loading, profileLoading, isProfessional, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
