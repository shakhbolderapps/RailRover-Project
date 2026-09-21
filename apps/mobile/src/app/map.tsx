import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { Button } from '@/components/Button';
import { palette } from '@/theme/colors';
import { useSession } from '@/stores/session';

/**
 * The map (SOW M2). Phase 3c replaces this body with MapLibre and live crossing markers;
 * for now it proves the session layer end to end.
 */
export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const status = useSession((s) => s.status);
  const deviceId = useSession((s) => s.deviceId);
  const signOut = useSession((s) => s.signOut);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <Text style={styles.title}>Map</Text>
      <Text style={styles.blurb}>
        Signed in as {status === 'guest' ? 'a guest' : 'an account holder'}.
      </Text>
      <Text style={styles.mono}>device: {deviceId ?? '—'}</Text>

      <View style={styles.actions}>
        {status === 'guest' ? (
          <Button label="Create an account" variant="secondary" onPress={() => router.push('/sign-up')} />
        ) : null}
        <Button label="Sign out" variant="ghost" onPress={() => void signOut()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background, paddingHorizontal: 24, gap: 10 },
  title: { color: palette.text, fontSize: 28, fontWeight: '700' },
  blurb: { color: palette.textMuted, fontSize: 15, lineHeight: 22 },
  mono: { color: palette.textMuted, fontSize: 12, fontFamily: 'monospace' },
  actions: { marginTop: 'auto', gap: 8 },
});
