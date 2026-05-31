import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '@/contexts/AuthContext';
import AuthStack from './AuthStack';
import MainStack from './MainStack';

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0A0A0A',
    card: '#0A0A0A',
    text: '#FFFFFF',
    primary: '#22C55E',
    border: '#2D2D2D',
  },
};

export default function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-surface">
        <ActivityIndicator size="large" color="#22C55E" />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      {session ? <MainStack /> : <AuthStack />}
    </NavigationContainer>
  );
}
