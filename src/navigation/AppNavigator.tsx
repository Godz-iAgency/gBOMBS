import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import { useInviteDeepLink } from '@/hooks/useInviteDeepLink';
import AuthStack from './AuthStack';
import OnboardingStack from './OnboardingStack';
import MainStack from './MainStack';
import ProfessionalStack from './ProfessionalStack';
import PaywallGate from './PaywallGate';
import AcceptInviteModal from '@/screens/professional/AcceptInviteModal';
import { hasActiveSubscription } from '@/lib/access';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0A0A0A',
    card: '#0A0A0A',
    text: '#F5F5F0',
    primary: '#2D6A4F',
    border: '#2D2D2D',
  },
};

function Splash() {
  return (
    <View className="flex-1 items-center justify-center bg-surface">
      <ActivityIndicator size="large" color="#2D6A4F" />
    </View>
  );
}

export default function AppNavigator() {
  const {
    session,
    profile,
    loading,
    profileLoading,
    isProfessional,
    pendingInviteCode,
    setPendingInviteCode,
    refreshProfile,
  } = useAuth();

  // Capture an invite code from a `gbombs://connect?code=` deep link. Held in
  // context (setPendingInviteCode) so it survives the sign-in detour below and
  // surfaces the accept modal once there's a session — regardless of which
  // stack is currently mounted.
  useInviteDeepLink(setPendingInviteCode);

  // 1. Booting the session.
  if (loading) return <Splash />;

  // 2. Not signed in → auth screens.
  let content;
  if (!session) {
    content = <AuthStack />;
  } else if (!profile && profileLoading) {
    // 3. Signed in, profile still loading.
    content = <Splash />;
  } else if (profile && isProfessional && !hasActiveSubscription(profile)) {
    // 4. PURE PROFESSIONAL: an active chef/trainer with no personal
    //    subscription. They exist only to serve their client(s) — give them the
    //    stripped clients-only app, never the client onboarding or the paywall.
    //    (A dual-role user WITH a subscription falls through to MainStack and
    //    keeps the full app + the Personal/Professional toggle.)
    content = <ProfessionalStack />;
  } else if (profile && !profile.onboarding_completed) {
    // 5. Signed in but hasn't finished onboarding.
    content = <OnboardingStack />;
  } else if (profile && !hasActiveSubscription(profile)) {
    // 6. Onboarded but no active subscription → card-required paywall.
    content = <PaywallGate />;
  } else {
    // 7. Signed in + onboarded + subscribed (or profile unavailable — fail
    //    open to the app so a transient profile-fetch error can't lock out a
    //    paying user).
    content = <MainStack />;
  }

  return (
    <>
      <NavigationContainer theme={navTheme}>{content}</NavigationContainer>

      {/* Deep-link invite: once signed in, surface the accept flow over whatever
          stack is mounted, with the code prefilled. A signed-OUT user's code is
          held until they sign in (this simply waits for `session`). Accepting
          flips isProfessional via refreshProfile, so the navigator re-routes. */}
      {session && pendingInviteCode && (
        <AcceptInviteModal
          visible
          initialCode={pendingInviteCode}
          onConnected={() => refreshProfile()}
          onClose={() => setPendingInviteCode(null)}
        />
      )}
    </>
  );
}
