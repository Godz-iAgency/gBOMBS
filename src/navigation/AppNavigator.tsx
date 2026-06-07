import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import AuthStack from './AuthStack';
import OnboardingStack from './OnboardingStack';
import MainStack from './MainStack';

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
  const { session, profile, loading, profileLoading } = useAuth();

  // 1. Booting the session.
  if (loading) return <Splash />;

  // 2. Not signed in → auth screens.
  let content;
  if (!session) {
    content = <AuthStack />;
  } else if (!profile && profileLoading) {
    // 3. Signed in, profile still loading.
    content = <Splash />;
  } else if (profile && !profile.onboarding_completed) {
    // 4. Signed in but hasn't finished onboarding.
    content = <OnboardingStack />;
  } else {
    // 5. Signed in + onboarded (or profile unavailable — fail open to app).
    content = <MainStack />;
  }

  return (
    <NavigationContainer theme={navTheme}>{content}</NavigationContainer>
  );
}
