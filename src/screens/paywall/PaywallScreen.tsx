import { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  createCheckout,
  openCheckoutUrl,
  openBillingPortal,
  type Plan,
} from '@/lib/subscription';
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

/** At least 10 digits = a usable phone number. */
function isValidPhone(raw: string): boolean {
  return raw.replace(/\D/g, '').length >= 10;
}

/** Blocking, cross-platform notice that resolves once acknowledged. */
function confirmNotice(title: string, message: string): Promise<void> {
  return new Promise((resolve) => {
    if (Platform.OS === 'web') {
      // window.alert is synchronous on web.
      window.alert(`${title}\n\n${message}`);
      resolve();
    } else {
      Alert.alert(title, message, [
        { text: 'Continue', onPress: () => resolve() },
      ]);
    }
  });
}

export default function PaywallScreen({ gated = false }: { gated?: boolean }) {
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState(false);
  const { profile, signOut } = useAuth();

  // Used to scroll the phone field into view and focus it when a user taps a
  // plan before entering a number (the field sits at the top and is easy to
  // miss after scrolling down to the plan cards).
  const scrollRef = useRef<ScrollView>(null);
  const phoneInputRef = useRef<TextInput>(null);
  const phoneY = useRef(0);

  // A user who lands here with a real subscription that needs attention
  // (payment failed) should fix it in the portal, not start a new checkout.
  const needsBillingFix =
    !!profile?.subscription_id &&
    (profile.subscription_status === 'past_due' ||
      profile.subscription_status === 'incomplete');

  async function handlePortal() {
    setPortalLoading(true);
    try {
      await openBillingPortal();
    } catch (e) {
      Alert.alert('Could not open billing', (e as Error).message);
    } finally {
      setPortalLoading(false);
    }
  }

  async function handleChoose(plan: Plan) {
    if (!isValidPhone(phone)) {
      // Pull the phone field into view, highlight it, focus it, then tell them.
      setPhoneError(true);
      scrollRef.current?.scrollTo({
        y: Math.max(0, phoneY.current - 20),
        animated: true,
      });
      phoneInputRef.current?.focus();
      Alert.alert(
        'Phone number needed',
        'Please enter your phone number to continue.'
      );
      return;
    }

    setLoadingPlan(plan);
    try {
      const res = await createCheckout(plan, phone);

      if (res.kind === 'already_subscribed') {
        await confirmNotice(
          'You already have a subscription',
          "We'll open your billing portal so you can manage it."
        );
        await openBillingPortal();
        return;
      }

      // Trial withheld (this phone/email already used one) → tell them first.
      if (res.trialBlocked && res.message) {
        await confirmNotice('Heads up', res.message);
      }
      await openCheckoutUrl(res.url);
      // On web the browser redirects to Stripe, so code after rarely runs.
    } catch (e) {
      Alert.alert('Checkout failed', (e as Error).message);
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      <ScrollView
        ref={scrollRef}
        contentContainerClassName="px-5 py-8"
        keyboardShouldPersistTaps="handled"
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

        {/* Payment-needs-fixing banner → portal, not a new checkout */}
        {needsBillingFix && (
          <View className="mb-5 rounded-2xl border border-brand-greenBright bg-surface-cardAlt p-4">
            <Text className="text-content text-base font-bold">
              Your payment needs attention
            </Text>
            <Text className="text-content-muted mt-1 text-sm">
              Update your payment method to keep your subscription active.
            </Text>
            <TouchableOpacity
              onPress={handlePortal}
              disabled={portalLoading}
              activeOpacity={0.85}
              className="mt-3 rounded-xl bg-brand-greenBright py-3"
            >
              {portalLoading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text className="text-center text-base font-bold text-white">
                  Update payment method
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Phone number — required, kept on record + used to guard the trial */}
        <View
          className="mb-5"
          onLayout={(e) => {
            phoneY.current = e.nativeEvent.layout.y;
          }}
        >
          <Text
            className={`mb-1.5 text-sm font-semibold ${
              phoneError ? 'text-red-400' : 'text-content'
            }`}
          >
            Phone number
          </Text>
          <TextInput
            ref={phoneInputRef}
            value={phone}
            onChangeText={(t) => {
              setPhone(t);
              if (phoneError) setPhoneError(false);
            }}
            placeholder="(555) 123-4567"
            placeholderTextColor="#6B7280"
            keyboardType="phone-pad"
            className="text-content rounded-xl border bg-surface-card px-4 py-3 text-base"
            style={
              phoneError
                ? { borderColor: '#EF4444', borderWidth: 2 }
                : { borderColor: '#2D2D2D' }
            }
          />
          {phoneError ? (
            <Text className="mt-1.5 text-xs font-semibold text-red-400">
              Please enter your phone number to continue.
            </Text>
          ) : (
            <Text className="text-content-muted mt-1.5 text-xs">
              Used to secure your account and your free trial.
            </Text>
          )}
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
