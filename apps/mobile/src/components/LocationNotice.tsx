import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/Button';
import { palette, statusColors } from '@/theme/colors';
import type { LocationPermission } from '@/lib/location';

interface Props {
  permission: LocationPermission;
  onRequest: () => void;
}

/**
 * SOW M1 edge case: "A driver denies location permission -> System explains that route alerts and
 * nearest-crossing reporting need location, and offers a path to enable it in settings."
 *
 * Note what this does NOT do: block the app. The crossing map is still worth reading without a
 * position — the driver simply has to pan to find where they are, and cannot report. Gating the
 * whole app behind the permission would be a worse product and a worse permission prompt, because
 * a driver who has already seen the value is far likelier to grant it on the second ask.
 */
export function LocationNotice({ permission, onRequest }: Props) {
  if (permission === 'granted') return null;

  const permanentlyDenied = permission === 'denied';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>
        {permanentlyDenied ? 'Location is turned off' : 'Location makes this useful'}
      </Text>
      <Text style={styles.body}>
        Without it, RailRover cannot centre the map on you, pick the nearest crossing when you
        report one, or warn you about blocked crossings ahead on your route.
      </Text>
      <Button
        label={permanentlyDenied ? 'Open settings' : 'Enable location'}
        variant="secondary"
        // Once the OS will no longer show the prompt, asking again is a no-op — the only path
        // left is system settings, so the button has to change with it.
        onPress={permanentlyDenied ? () => void Linking.openSettings() : onRequest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: statusColors.yellow,
    padding: 16,
    gap: 10,
  },
  title: { color: palette.text, fontSize: 16, fontWeight: '600' },
  body: { color: palette.textMuted, fontSize: 14, lineHeight: 20 },
});
