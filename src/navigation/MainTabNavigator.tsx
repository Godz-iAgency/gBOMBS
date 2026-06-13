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
  Grocery: { active: 'cart', inactive: 'cart-outline' },
  Profile: { active: 'person', inactive: 'person-outline' },
};

export default function MainTabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#5A9A3A',
        tabBarInactiveTintColor: '#A8A29E',
        tabBarStyle: {
          backgroundColor: '#0A0A0A',
          borderTopColor: '#2D2D2D',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused, color, size }) => {
          const name = focused
            ? ICONS[route.name].active
            : ICONS[route.name].inactive;
          return <Ionicons name={name} size={size} color={color} />;
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
