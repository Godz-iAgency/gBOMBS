import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingProvider } from '@/store/onboardingStore';
import WelcomeScreen from '@/screens/onboarding/WelcomeScreen';
import DietModeScreen from '@/screens/onboarding/DietModeScreen';
import HealthGoalScreen from '@/screens/onboarding/HealthGoalScreen';
import CookingStyleScreen from '@/screens/onboarding/CookingStyleScreen';
import FoodPreferenceScreen from '@/screens/onboarding/FoodPreferenceScreen';
import AllergiesScreen from '@/screens/onboarding/AllergiesScreen';
import PantryStarterScreen from '@/screens/onboarding/PantryStarterScreen';

export type OnboardingStackParamList = {
  Welcome: undefined;
  DietMode: undefined;
  HealthGoal: undefined;
  CookingStyle: undefined;
  FoodPreference: undefined;
  Allergies: undefined;
  PantryStarter: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export default function OnboardingStack() {
  return (
    <OnboardingProvider>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#0A0A0A' },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="DietMode" component={DietModeScreen} />
        <Stack.Screen name="HealthGoal" component={HealthGoalScreen} />
        <Stack.Screen name="CookingStyle" component={CookingStyleScreen} />
        <Stack.Screen name="FoodPreference" component={FoodPreferenceScreen} />
        <Stack.Screen name="Allergies" component={AllergiesScreen} />
        <Stack.Screen name="PantryStarter" component={PantryStarterScreen} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
