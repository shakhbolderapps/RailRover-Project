import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { checkConfig } from '@/lib/env';
import { palette, statusColors } from '@/theme/colors';

/**
 * Shown instead of the app when backend configuration is missing.
 *
 * Deliberately a screen rather than a thrown error: a top-level throw in a release build is a
 * white screen with no explanation, which is the least debuggable possible outcome for whoever
 * installs the APK next.
 */
export function SetupNotice() {
  const insets = useSafeAreaInsets();
  const checks = checkConfig();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 32 }]}
    >
      <Text style={styles.title}>Configuration needed</Text>
      <Text style={styles.blurb}>
        This build has no Supabase project configured, so there is nothing to show on the map.
      </Text>

      <View style={styles.card}>
        {checks.map((check) => (
          <View key={check.key} style={styles.row}>
            <Text
              style={[
                styles.mark,
                { color: check.present ? statusColors.green : statusColors.yellow },
              ]}
            >
              {check.present ? '✓' : '○'}
            </Text>
            <View style={styles.rowText}>
              <Text style={styles.label}>{check.label}</Text>
              <Text style={styles.value}>{check.present ? 'Set' : check.hint}</Text>
            </View>
          </View>
        ))}
      </View>

      <Text style={styles.note}>
        Copy .env.example to apps/mobile/.env, fill in the values, then restart the dev server.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 24, gap: 16 },
  title: { color: palette.text, fontSize: 26, fontWeight: '700' },
  blurb: { color: palette.textMuted, fontSize: 15, lineHeight: 22 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    padding: 16,
    gap: 14,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  mark: { fontSize: 16, fontWeight: '700', width: 18 },
  rowText: { flex: 1, gap: 2 },
  label: { color: palette.text, fontSize: 14, fontWeight: '500' },
  value: { color: palette.textMuted, fontSize: 12, lineHeight: 18 },
  note: { color: palette.textMuted, fontSize: 12, lineHeight: 18, fontStyle: 'italic' },
});
