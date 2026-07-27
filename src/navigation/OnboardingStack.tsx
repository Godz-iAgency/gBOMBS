import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { OnboardingProvider } from '@/store/onboardingStore';
import RoleChoiceScreen from '@/screens/onboarding/RoleChoiceScreen';
import ProfessionalConnectScreen from '@/screens/onboarding/ProfessionalConnectScreen';
import ProfessionalNameScreen from '@/screens/onboarding/ProfessionalNameScreen';
import WelcomeScreen from '@/screens/onboarding/WelcomeScreen';
import LocationScreen from '@/screens/onboarding/LocationScreen';
import DietModeScreen from '@/screens/onboarding/DietModeScreen';
import HealthGoalScreen from '@/screens/onboarding/HealthGoalScreen';
import CookingStyleScreen from '@/screens/onboarding/CookingStyleScreen';
import FoodPreferenceScreen from '@/screens/onboarding/FoodPreferenceScreen';
import AllergiesScreen from '@/screens/onboarding/AllergiesScreen';

export type OnboardingStackParamList = {
  RoleChoice: undefined;
  ProfessionalConnect: undefined;
  ProfessionalName: { roleLabel: string };
  Welcome: undefined;
  Location: undefined;
  DietMode: undefined;
  HealthGoal: undefined;
  CookingStyle: undefined;
  FoodPreference: undefined;
  Allergies: undefined;
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
        {/* Role fork comes first — a professional never sees the consumer flow */}
        <Stack.Screen name="RoleChoice" component={RoleChoiceScreen} />
        <Stack.Screen
          name="ProfessionalConnect"
          component={ProfessionalConnectScreen}
        />
        <Stack.Screen
          name="ProfessionalName"
          component={ProfessionalNameScreen}
        />
        <Stack.Screen name="Welcome" component={WelcomeScreen} />
        <Stack.Screen name="Location" component={LocationScreen} />
        <Stack.Screen name="DietMode" component={DietModeScreen} />
        <Stack.Screen name="HealthGoal" component={HealthGoalScreen} />
        <Stack.Screen name="CookingStyle" component={CookingStyleScreen} />
        <Stack.Screen name="FoodPreference" component={FoodPreferenceScreen} />
        <Stack.Screen name="Allergies" component={AllergiesScreen} />
      </Stack.Navigator>
    </OnboardingProvider>
  );
}
