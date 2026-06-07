import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabNavigator from './MainTabNavigator';

/**
 * Authenticated app shell. The bottom tabs (Home, Meal Plan, Grocery, Profile)
 * are the root; this native stack wraps them so detail screens (recipe cards,
 * etc.) can be pushed OVER the tabs in later phases.
 */
export type MainStackParamList = {
  Tabs: undefined;
};

const Stack = createNativeStackNavigator<MainStackParamList>();

export default function MainStack() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0A0A0A' },
      }}
    >
      <Stack.Screen name="Tabs" component={MainTabNavigator} />
    </Stack.Navigator>
  );
}
