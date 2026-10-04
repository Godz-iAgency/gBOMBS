import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/contexts/AuthContext';
import { BRAND_TAGLINE_IMAGE } from '@/utils/gbombsImages';
import { AiServiceError } from '@/services/ai/client';
import {
  sendCoachMessage,
  isCoachConfigured,
  type CoachTurn,
  type CoachContext,
} from '@/services/coach';
import {
  buildCoachContext,
  loadCoachHistory,
  saveCoachHistory,
  clearCoachHistory,
  getCoachUsage,
  recordCoachMessage,
  type CoachUsage,
} from '@/lib/coach';

const STARTERS = [
  'What should I eat to include my missing plant groups today?',
  'Give me a quick high-greens lunch idea',
  'Why are mushrooms one of the six plant groups?',
  'A healthy dessert I can make tonight?',
];

/** One chat bubble — user on the right (green), coach on the left (card). */
function Bubble({ turn }: { turn: CoachTurn }) {
  const isUser = turn.role === 'user';
  return (
    <View
      className={`mb-3 max-w-[85%] rounded-2xl px-4 py-3 ${
        isUser ? 'self-end bg-brand-green' : 'self-start bg-surface-card'
      }`}
    >
      <Text
        className="text-[15px] leading-5"
        style={{ color: '#F5F5F0' }}
      >
        {turn.content}
      </Text>
    </View>
  );
}

export default function CoachScreen() {
  const { user, profile } = useAuth();
  const { width } = useWindowDimensions();
  const taglineHeight = Math.min(Math.max(width - 40, 0), 540) / 3;
  const tier = profile?.subscription_tier ?? 'standard';

  const [messages, setMessages] = useState<CoachTurn[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [booting, setBooting] = useState(true);
  const [usage, setUsage] = useState<CoachUsage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ctxRef = useRef<CoachContext | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (!user?.id || !usage?.resetsAt) return;
    const delay = Date.parse(usage.resetsAt) - Date.now();
    if (!Number.isFinite(delay)) return;
    const timer = setTimeout(() => {
      getCoachUsage(user.id, tier).then(setUsage).catch(() => {
        setError('Unable to refresh your message allowance. Please reopen Coach.');
      });
    }, Math.max(1000, delay + 1000));
    return () => clearTimeout(timer);
  }, [user?.id, tier, usage?.resetsAt]);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollToEnd({ animated: true }));
  }, []);

  // Load history, usage, and the personalization context when the tab opens.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (!user?.id) {
        setBooting(false);
        return;
      }
      (async () => {
        const [history, use, ctx] = await Promise.all([
          loadCoachHistory(user.id),
          getCoachUsage(user.id, tier).catch((e: unknown) => {
            if (active) setError(e instanceof Error ? e.message : 'Unable to check your message allowance.');
            return null;
          }),
          buildCoachContext(user.id),
        ]);
        if (!active) return;
        ctxRef.current = ctx;
        setMessages(history);
        setUsage(use);
        setBooting(false);
        if (history.length) scrollToEnd();
      })();
      return () => {
        active = false;
      };
    }, [user?.id, tier, scrollToEnd])
  );

  const send = useCallback(
    async (raw: string) => {
      const text = raw.trim();
      if (!text || sending || !user?.id) return;
      if (usage && usage.remaining <= 0) return;

      setError(null);
      setInput('');
      const withUser: CoachTurn[] = [...messages, { role: 'user', content: text }];
      setMessages(withUser);
      saveCoachHistory(user.id, withUser);
      setSending(true);
      scrollToEnd();

      try {
        const ctx = ctxRef.current ?? (await buildCoachContext(user.id));
        ctxRef.current = ctx;
        // Pass prior turns (exclude the just-added user message — sendCoachMessage
        // appends it itself).
        const reply = await sendCoachMessage(messages, text, ctx);
        const withReply: CoachTurn[] = [
          ...withUser,
          { role: 'assistant', content: reply },
        ];
        setMessages(withReply);
        saveCoachHistory(user.id, withReply);
        const nextUsage = await recordCoachMessage(user.id, tier);
        setUsage(nextUsage);
        scrollToEnd();
      } catch (e) {
        if (e instanceof AiServiceError && e.usage) setUsage(e.usage);
        setError(
          (e as Error).message ||
            'The coach is unavailable right now. Please try again.'
        );
      } finally {
        setSending(false);
      }
    },
    [messages, sending, user?.id, usage, tier, scrollToEnd]
  );

  const handleClear = useCallback(() => {
    if (!user?.id) return;
    setMessages([]);
    setError(null);
    clearCoachHistory(user.id);
  }, [user?.id]);

  const notConfigured = !isCoachConfigured();
  const limitReached = !!usage && usage.remaining <= 0;
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (booting) {
    return (
      <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#5A9A3A" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top']}>
      {/* Header */}
      <View
        className="px-5 pb-3 pt-3"
        style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}
      >
        <View
          className="overflow-hidden rounded-2xl"
          style={{ backgroundColor: '#FFFFFF', alignSelf: 'center', width: '100%', maxWidth: 540 }}
        >
          <Image
            source={BRAND_TAGLINE_IMAGE}
            resizeMode="contain"
            style={{ width: '100%', height: taglineHeight }}
            accessibilityLabel="Healthy Eating Made Simple"
          />
        </View>
        {messages.length > 0 ? (
          <TouchableOpacity
            onPress={handleClear}
            disabled={sending}
            accessibilityRole="button"
            accessibilityLabel="Clear coach conversation"
            className="mt-2 flex-row items-center self-end rounded-full bg-surface-card px-3 py-2"
          >
            <Ionicons name="trash-outline" size={16} color="#A8A29E" />
            <Text className="text-content-muted ml-1.5 text-xs">Clear chat</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <KeyboardAvoidingView
        className="flex-1"
        style={{ width: '100%', maxWidth: 760, alignSelf: 'center' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5"
          contentContainerStyle={{ paddingVertical: 8, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Empty state with starter prompts */}
          {messages.length === 0 ? (
            <View className="mt-4">
              <View className="items-center">
                <Text className="text-content text-lg font-bold">
                  Your plant-based coach
                </Text>
                <Text className="text-content-muted mt-1 text-center text-sm">
                  Ask anything about your six plant groups, meals, or healthy eating.
                </Text>
              </View>
              <View className="mt-6">
                {STARTERS.map((s) => (
                  <TouchableOpacity
                    key={s}
                    onPress={() => send(s)}
                    disabled={notConfigured || limitReached}
                    activeOpacity={0.85}
                    className="mb-2.5 rounded-2xl border border-surface-border bg-surface-card px-4 py-3"
                  >
                    <Text className="text-content text-sm">{s}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            messages.map((m, i) => <Bubble key={i} turn={m} />)
          )}

          {/* Typing indicator */}
          {sending ? (
            <View className="mb-3 max-w-[85%] self-start rounded-2xl bg-surface-card px-4 py-3">
              <ActivityIndicator color="#5A9A3A" />
            </View>
          ) : null}

          {/* Error with retry */}
          {error ? (
            <View className="mb-3 rounded-2xl border border-red-500/40 bg-surface-card px-4 py-3">
              <Text className="text-sm text-red-400">{error}</Text>
              {lastUserMessage ? (
                <TouchableOpacity
                  onPress={() => send(lastUserMessage.content)}
                  className="mt-2 self-start"
                >
                  <Text className="text-sm font-bold text-brand-green">
                    Tap to retry
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </ScrollView>

        {/* Composer / states */}
        {notConfigured ? (
          <View className="border-t border-surface-border px-5 py-4">
            <Text className="text-content-muted text-center text-sm">
              The Coach isn't available right now.
            </Text>
          </View>
        ) : limitReached ? (
          <View className="border-t border-surface-border px-5 py-4">
            <Text className="text-content text-center text-sm font-semibold">
              You've used all {usage?.limit} messages for today
            </Text>
            <Text className="text-content-muted mt-1 text-center text-xs">
              Your messages renew {usage?.resetsAt ? new Date(usage.resetsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'each day'}.
              {tier !== 'wellness_pro' ? ' Upgrade to Premium for more.' : ''}
            </Text>
          </View>
        ) : (
          <View className="border-t border-surface-border px-4 py-3">
            <View className="mb-2 flex-row flex-wrap items-center justify-between">
              <Text className="text-content-muted mr-2 text-xs font-semibold">Ask your coach</Text>
              {usage ? (
                <Text
                  className="text-content-muted text-xs"
                  accessibilityLiveRegion="polite"
                  testID="coach-messages-remaining"
                >
                  {usage.remaining} {usage.remaining === 1 ? 'message' : 'messages'} left today
                </Text>
              ) : null}
            </View>
            <View className="flex-row items-end">
              <TextInput
                value={input}
                onChangeText={setInput}
                placeholder="Ask your coach…"
                accessibilityLabel="Ask your coach"
                placeholderTextColor="#6B7280"
                multiline
                className="text-content max-h-28 flex-1 rounded-2xl bg-surface-card px-4 py-3 text-[15px]"
                style={{ borderColor: '#2D2D2D', borderWidth: 1 }}
                onSubmitEditing={() => send(input)}
              />
              <TouchableOpacity
                onPress={() => send(input)}
                disabled={sending || !input.trim()}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Send message"
                className="ml-2 h-12 w-12 items-center justify-center rounded-full"
                style={{
                  backgroundColor: input.trim() && !sending ? '#5A9A3A' : '#2D2D2D',
                }}
              >
                <Ionicons name="arrow-up" size={22} color="#0A0A0A" />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
