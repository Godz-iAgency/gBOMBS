import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ProfessionalHomeScreen from '@/screens/professional/ProfessionalHomeScreen';
import ProfessionalAccountScreen from '@/screens/professional/ProfessionalAccountScreen';

/**
 * The ENTIRE app for a pure professional (a chef/trainer with no personal
 * subscription). No bottom tabs, no Home/Meal Plan/Coach/Grocery — just their
 * clients and a minimal account screen. They can't do anything on the platform
 * except serve the client(s) who invited them.
 */
export type ProfessionalStackParamList = {
  MyClients: undefined;
  Account: undefined;
};

const Stack = createNativeStackNavigator<ProfessionalStackParamList>();

export default function ProfessionalStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0A0A' },
      }}
    >
      <Stack.Screen name="MyClients" component={ProfessionalHomeScreen} />
      <Stack.Screen name="Account" component={ProfessionalAccountScreen} />
    </Stack.Navigator>
  );
}
