import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { palette } from '@/theme/colors';

interface Props extends TextInputProps {
  label: string;
}

export function TextField({ label, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={palette.textMuted}
        style={[styles.input, style]}
        {...rest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  label: {
    color: palette.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    minHeight: 52,
    borderRadius: 12,
    paddingHorizontal: 16,
    backgroundColor: palette.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    color: palette.text,
    fontSize: 16,
  },
});
