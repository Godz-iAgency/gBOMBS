import { View, Text, TouchableOpacity, Image, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import LetterTile from '@/components/LetterTile';
import { GBOMBS_LETTERS, LOGO_WITH_BG } from '@/utils/gbombsImages';
import type { OnboardingStackParamList } from '@/navigation/OnboardingStack';

type Props = NativeStackScreenProps<OnboardingStackParamList, 'Welcome'>;

const BLURBS: Record<string, string> = {
  greens: 'Leafy greens — the most nutrient-dense food on earth',
  beans: 'Legumes for steady energy, fiber, and plant protein',
  onion: 'Alliums that defend every cell in your body',
  mushroom: 'Fungi that supercharge your immune system',
  berries: 'The brain-protecting antioxidant kings',
  seeds: 'Seeds & nuts packed with healthy fats',
};

export default function WelcomeScreen({ navigation }: Props) {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerClassName="px-6 pb-4 pt-2"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View className="mb-3 mt-2 items-center">
          <Image
            source={LOGO_WITH_BG}
            style={{ width: '100%', height: 120 }}
            resizeMode="contain"
          />
          <Text className="text-content-muted -mt-1 text-base">
            Healthy Eating Made Simple
          </Text>
        </View>

        <Text className="text-content mt-4 text-center text-xl font-bold">
          The six most nutrient-dense{'\n'}food groups on earth
        </Text>

        {/* Food group cards */}
        <View className="mt-6">
          {GBOMBS_LETTERS.map((g) => (
            <View
              key={g.key}
              className="mb-3 flex-row items-center rounded-2xl border p-3"
              style={{
                borderColor: g.glow + '4D',
                backgroundColor: g.color + '14',
              }}
            >
              <LetterTile
                image={g.image}
                color={g.color}
                glow={g.glow}
                // Berries/Seeds (landscape) stay larger + cover. Portrait letters
                // shrink 4px and use contain so the whole letter shows.
                size={g.key === 'berries' || g.key === 'seeds' ? 66 : 50}
                resizeMode={
                  g.key === 'berries' || g.key === 'seeds' ? 'cover' : 'contain'
                }
              />
              <View className="ml-4 flex-1">
                <Text
                  className="text-lg font-extrabold"
                  style={{ color: g.glow }}
                >
                  {g.word}
                </Text>
                <Text className="text-content-muted mt-0.5 text-xs leading-4">
                  {BLURBS[g.key]}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* CTA */}
      <View className="border-t border-surface-border px-6 pb-4 pt-4">
        <TouchableOpacity
          onPress={() => navigation.navigate('DietMode')}
          activeOpacity={0.85}
          className="rounded-xl bg-brand-green py-4"
        >
          <Text className="text-center text-base font-bold text-white">
            Let's get started
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
