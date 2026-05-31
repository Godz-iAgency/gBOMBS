import { useState } from 'react';
import { View, TextInput, TouchableOpacity, type TextInputProps } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

type Props = Omit<TextInputProps, 'secureTextEntry'> & {
  /** Tailwind margin class applied to the wrapper, e.g. "mb-4". */
  containerClassName?: string;
};

/**
 * Password field with a show/hide eye toggle. Drop-in replacement for a plain
 * <TextInput secureTextEntry />. The eye icon sits inside the field on the right.
 */
export default function PasswordInput({
  containerClassName = 'mb-4',
  ...inputProps
}: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View className={`relative ${containerClassName}`}>
      <TextInput
        {...inputProps}
        secureTextEntry={!visible}
        autoCapitalize="none"
        placeholderTextColor="#6B7280"
        className="rounded-xl border border-surface-border bg-surface-card py-3.5 pl-4 pr-12 text-base text-content"
      />
      <TouchableOpacity
        onPress={() => setVisible((v) => !v)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel={visible ? 'Hide password' : 'Show password'}
        className="absolute right-3 top-0 bottom-0 justify-center"
      >
        <Ionicons
          name={visible ? 'eye-off-outline' : 'eye-outline'}
          size={22}
          color="#9CA3AF"
        />
      </TouchableOpacity>
    </View>
  );
}
