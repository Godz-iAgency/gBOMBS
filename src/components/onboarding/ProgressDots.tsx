import { View } from 'react-native';

/** Row of step dots. The current step is a wider green pill; others are dots. */
export default function ProgressDots({
  total,
  current,
}: {
  total: number;
  current: number; // 1-based
}) {
  return (
    <View className="flex-row items-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const step = i + 1;
        const isActive = step === current;
        const isDone = step < current;
        return (
          <View
            key={step}
            className={
              isActive
                ? 'h-2 w-6 rounded-full bg-brand-green'
                : isDone
                  ? 'h-2 w-2 rounded-full bg-brand-green'
                  : 'h-2 w-2 rounded-full bg-surface-border'
            }
          />
        );
      })}
    </View>
  );
}
