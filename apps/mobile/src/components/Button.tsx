import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { palette } from '@/theme/colors';

type Variant = 'primary' | 'secondary' | 'ghost';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}

/**
 * Hit targets are 52pt rather than the 44pt minimum: the SOW's core flow is two taps in under
 * five seconds while driving, so every button in this app is a one-handed, glanced-at target.
 */
export function Button({ label, onPress, variant = 'primary', loading, disabled, style }: Props) {
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !inactive ? styles.pressed : null,
        inactive ? styles.inactive : null,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? palette.text : palette.textMuted} />
      ) : (
        <Text style={[styles.label, variant === 'ghost' ? styles.ghostLabel : null]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: { backgroundColor: palette.accent },
  secondary: {
    backgroundColor: palette.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
  },
  ghost: { backgroundColor: 'transparent', minHeight: 44 },
  pressed: { opacity: 0.8 },
  inactive: { opacity: 0.5 },
  label: { color: palette.text, fontSize: 16, fontWeight: '600' },
  ghostLabel: { color: palette.textMuted, fontWeight: '500' },
});
