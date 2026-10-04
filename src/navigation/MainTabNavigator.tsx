import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '@/screens/home/HomeScreen';
import MealPlanScreen from '@/screens/mealplan/MealPlanScreen';
import CoachScreen from '@/screens/coach/CoachScreen';
import GroceryScreen from '@/screens/grocery/GroceryScreen';
import ProfileScreen from '@/screens/profile/ProfileScreen';

export type MainTabParamList = {
  Home: undefined;
  MealPlan: undefined;
  Coach: undefined;
  Grocery: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

// Per-tab icon names (filled when focused, outline otherwise).
const ICONS: Record<
  keyof MainTabParamList,
  { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }
> = {
  Home: { active: 'home', inactive: 'home-outline' },
  MealPlan: { active: 'calendar', inactive: 'calendar-outline' },
  Coach: { active: 'chatbubble', inactive: 'chatbubble-outline' },
  Grocery: { active: 'list', inactive: 'list-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export default function MainTabNavigator() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#A8D38D',
        tabBarInactiveTintColor: '#A8A29E',
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopColor: '#2D2D2D',
          borderTopWidth: 1,
          width: '100%',
          maxWidth: 760,
          alignSelf: 'center',
          height: 68 + insets.bottom,
          paddingTop: 5,
          paddingBottom: Math.max(6, insets.bottom),
        },
        tabBarLabelPosition: 'below-icon',
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600', lineHeight: 16 },
        tabBarIcon: ({ focused, color }) => {
          return <View style={{ width: 44, height: 30, borderRadius: 10, backgroundColor: focused ? '#8CB56918' : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Ionicons name={ICONS[route.name].inactive} size={22} color={color} /></View>;
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen
        name="MealPlan"
        component={MealPlanScreen}
        options={{ title: 'Meal Plan' }}
      />
      <Tab.Screen name="Coach" component={CoachScreen} />
      <Tab.Screen name="Grocery" component={GroceryScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
}
