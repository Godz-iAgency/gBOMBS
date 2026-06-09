import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { startCheckout, type Plan } from '@/lib/subscription';
import { LOGO_WITH_BG } from '@/utils/gbombsImages';
import { useAuth } from '@/contexts/AuthContext';

type PlanCard = {
  key: Plan;
  name: string;
  price: string;
  tagline: string;
  features: string[];
  highlighted?: boolean;
};

const PLANS: PlanCard[] = [
  {
    key: 'starter',
    name: 'gBOMBS Starter',
    price: '$19.99',
    tagline: 'Everything you need to eat well.',
    features: [
      'AI-personalized weekly meal plans',
      'Daily gBOMBS score tracking',
      'Auto-built grocery lists',
      'One-tap Instacart delivery',
      'Recipes, badges & progress reports',
    ],
  },
  {
    key: 'premium',
    name: 'gBOMBS Premium',
    price: '$49.99',
    tagline: 'Add your own expert team.',
    highlighted: true,
    features: [
      'Everything in Starter',
      'Connect a personal chef',
      'Connect a trainer or nutritionist',
      'Pro dashboards for your team',
      'Priority support',
    ],
  },
];

export default function PaywallScreen({ gated = false }: { gated?: boolean }) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const { signOut } = useAuth();

  async function handleChoose(plan: Plan) {
    setLoadingPlan(plan);
    try {
      await startCheckout(plan);
      // On web the browser redirects to Stripe, so this line rarely runs.
    } catch (e) {
      Alert.alert('Checkout failed', (e as Error).message);
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <ScrollView
        contentContainerClassName="px-5 py-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mb-6 items-center">
          <Image
            source={LOGO_WITH_BG}
            style={{ width: '90%', height: 90 }}
            resizeMode="contain"
          />
          <Text className="text-content mt-4 text-center text-2xl font-extrabold">
            Choose your plan
          </Text>
          <Text className="text-content-muted mt-2 text-center text-sm">
            Start with a 7-day free trial. Cancel anytime before it ends and you
            won't be charged.
          </Text>
        </View>

        {/* Plan cards */}
        {PLANS.map((plan) => (
          <View
            key={plan.key}
            className={`mb-4 rounded-2xl border p-5 ${
              plan.highlighted
                ? 'border-brand-greenBright bg-surface-cardAlt'
                : 'border-surface-border bg-surface-card'
            }`}
          >
            {plan.highlighted && (
              <View className="mb-3 self-start rounded-full bg-brand-greenBright px-3 py-1">
                <Text className="text-xs font-bold uppercase tracking-wide text-white">
                  Most popular
                </Text>
              </View>
            )}

            <Text className="text-content text-lg font-bold">{plan.name}</Text>
            <Text className="text-content-muted mt-0.5 text-sm">
              {plan.tagline}
            </Text>

            <View className="mt-3 flex-row items-end">
              <Text className="text-content text-3xl font-extrabold">
                {plan.price}
              </Text>
              <Text className="text-content-muted mb-1 ml-1 text-sm">/month</Text>
            </View>

            {/* Features */}
            <View className="mt-4">
              {plan.features.map((f) => (
                <View key={f} className="mb-2 flex-row items-start">
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color="#5A9A3A"
                    style={{ marginTop: 1 }}
                  />
                  <Text className="text-content ml-2 flex-1 text-sm">{f}</Text>
                </View>
              ))}
            </View>

            {/* CTA */}
            <TouchableOpacity
              onPress={() => handleChoose(plan.key)}
              disabled={loadingPlan !== null}
              activeOpacity={0.85}
              className={`mt-5 rounded-xl py-4 ${
                plan.highlighted ? 'bg-brand-greenBright' : 'bg-brand-green'
              }`}
            >
              {loadingPlan === plan.key ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-center text-base font-bold text-white">
                  Start 7-day free trial
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ))}

        <Text className="text-content-muted mt-2 text-center text-xs">
          You'll be charged {`${PLANS[0].price}`}–{`${PLANS[1].price}`}/month
          after the trial unless you cancel. Secure checkout by Stripe.
        </Text>

        {/* Escape hatch when shown as the subscription gate, so a user who
            doesn't want to subscribe isn't trapped on this screen. */}
        {gated && (
          <TouchableOpacity
            onPress={signOut}
            activeOpacity={0.7}
            className="mt-6 py-2"
          >
            <Text className="text-content-muted text-center text-sm underline">
              Not now — sign out
            </Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
