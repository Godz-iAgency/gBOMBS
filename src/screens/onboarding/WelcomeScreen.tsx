import { View, Text, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

const GBOMBS = [
  { letter: 'G', word: 'Greens', color: '#16A34A' },
  { letter: 'B', word: 'Beans', color: '#92400E' },
  { letter: 'O', word: 'Onion', color: '#7C3AED' },
  { letter: 'M', word: 'Mushroom', color: '#B45309' },
  { letter: 'B', word: 'Berries', color: '#BE185D' },
  { letter: 'S', word: 'Seeds', color: '#CA8A04' },
];

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <View className="flex-1 justify-center px-6">
        <View className="mb-2 items-center">
          <Text className="text-brand-green text-5xl font-extrabold tracking-tight">
            gBOMBS
          </Text>
          <Text className="text-content-muted mt-2 text-base">
            Healthy Eating Made Simple
          </Text>
        </View>

        <Text className="text-content mt-10 text-center text-lg font-semibold">
          The six most nutrient-dense{'\n'}food groups on earth
        </Text>

        <View className="mt-8">
          {GBOMBS.map((g, i) => (
            <View key={i} className="mb-2 flex-row items-center">
              <View
                className="h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: g.color }}
              >
                <Text className="text-lg font-extrabold text-white">
                  {g.letter}
                </Text>
              </View>
              <Text className="text-content ml-4 text-base font-medium">
                {g.word}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className="px-6 pb-6">
        <TouchableOpacity
          onPress={() => navigation.navigate('DietMode')}
          activeOpacity={0.85}
          className="rounded-xl bg-brand-green py-4"
        >
          <Text className="text-center text-base font-bold text-surface">
            Let's get started
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
