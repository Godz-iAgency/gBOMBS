import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ProgressDots from './ProgressDots';

/**
 * Shared layout for onboarding steps: progress dots + "Step X of 7" + title +
 * subtitle + scrollable content + a fixed bottom primary button.
 */
export default function OnboardingScaffold({
  step,
  totalSteps = 7,
  title,
  subtitle,
  children,
  buttonLabel,
  onPressButton,
  buttonDisabled = false,
  buttonLoading = false,
  footer,
}: {
  step: number;
  totalSteps?: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  buttonLabel: string;
  onPressButton: () => void;
  buttonDisabled?: boolean;
  buttonLoading?: boolean;
  footer?: React.ReactNode;
}) {
  return (
    <SafeAreaView className="flex-1 bg-surface" edges={['top', 'bottom']}>
      {/* Header */}
      <View className="px-6 pb-2 pt-4">
        <ProgressDots total={totalSteps} current={step} />
        <Text className="text-content-muted mt-4 text-xs font-medium uppercase tracking-wider">
          Step {step} of {totalSteps}
        </Text>
        <Text className="text-content mt-2 text-2xl font-bold">{title}</Text>
        {subtitle ? (
          <Text className="text-content-muted mt-1 text-base">{subtitle}</Text>
        ) : null}
      </View>

      {/* Content */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-6 pt-2"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>

      {/* Footer button */}
      <View className="border-t border-surface-border px-6 pb-2 pt-4">
        {footer}
        <TouchableOpacity
          onPress={onPressButton}
          disabled={buttonDisabled || buttonLoading}
          activeOpacity={0.85}
          className={
            buttonDisabled
              ? 'rounded-xl bg-surface-card py-4'
              : 'rounded-xl bg-brand-green py-4'
          }
        >
          {buttonLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text
              className={
                buttonDisabled
                  ? 'text-center text-base font-bold text-content-muted'
                  : 'text-center text-base font-bold text-white'
              }
            >
              {buttonLabel}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
