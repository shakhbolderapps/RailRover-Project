import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { palette, statusColors } from '@/theme/colors';
import { useSession } from '@/stores/session';

/**
 * First run (SOW M1).
 *
 * Guest is the primary action, not a fallback link. The SOW's goal is to "keep first-run friction
 * low", and a driver who has just been stopped at a blocked crossing is not going to create an
 * account before reporting it.
 */
export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const continueAsGuest = useSession((s) => s.continueAsGuest);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onGuest = async () => {
    setBusy(true);
    setError(null);
    const result = await continueAsGuest();
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? null);
      return;
    }
    // Navigate explicitly. The auth listener updates `status`, but nothing re-renders index.tsx
    // while we are sitting on /welcome, so waiting for its redirect leaves the driver stranded
    // here on a screen whose button has silently already worked.
    router.replace('/');
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.hero}>
        <View style={styles.dots}>
          <View style={[styles.dot, { backgroundColor: statusColors.red }]} />
          <View style={[styles.dot, { backgroundColor: statusColors.yellow }]} />
          <View style={[styles.dot, { backgroundColor: statusColors.green }]} />
        </View>
        <Text style={styles.title}>RailRover</Text>
        <Text style={styles.tagline}>
          Real-time railroad crossing status, reported by the drivers who are actually there.
        </Text>
      </View>

      <View style={styles.actions}>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button label="Continue as guest" onPress={onGuest} loading={busy} />
        <Text style={styles.hint}>
          You can report crossings right away. Create an account later to keep your history.
        </Text>

        <Button
          label="Create an account"
          variant="secondary"
          onPress={() => router.push('/sign-up')}
          disabled={busy}
        />
        <Button
          label="I already have an account"
          variant="ghost"
          onPress={() => router.push('/sign-in')}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background, paddingHorizontal: 24, gap: 24 },
  hero: { flex: 1, justifyContent: 'center', gap: 16 },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  title: { color: palette.text, fontSize: 40, fontWeight: '700', letterSpacing: -1 },
  tagline: { color: palette.textMuted, fontSize: 16, lineHeight: 24 },
  actions: { gap: 12 },
  hint: { color: palette.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  error: {
    color: statusColors.red,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
});
