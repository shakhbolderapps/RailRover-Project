import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { Button } from '@/components/Button';
import { palette } from '@/theme/colors';
import { useSession } from '@/stores/session';
import { useLocation } from '@/stores/location';
import {
  deleteAccount,
  fetchDevicePreferences,
  getPushPermission,
  requestPushPermission,
  registerForPush,
  setAutoReroute,
  setPushEnabled,
  type PushPermission,
} from '@/lib/notifications';

/**
 * Settings (SOW M1 "Settings" and "Notifications" AC4).
 *
 * Both permission rows tell the driver the truth about what is off and what turning it on will
 * do, and both send them to system settings once the OS will no longer show a prompt — a toggle
 * that silently does nothing is worse than no toggle.
 */
export default function SettingsScreen() {
  const status = useSession((s) => s.status);
  const deviceId = useSession((s) => s.deviceId);
  const signOut = useSession((s) => s.signOut);
  const locationPermission = useLocation((s) => s.permission);
  const startLocation = useLocation((s) => s.start);

  const [push, setPush] = useState<PushPermission>('undetermined');
  const [pushOn, setPushOn] = useState(false);
  const [autoReroute, setAutoRerouteOn] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    void getPushPermission().then((permission) => {
      setPush(permission);
      setPushOn(permission === 'granted');
    });
  }, []);

  useEffect(() => {
    if (!deviceId) return;
    void fetchDevicePreferences(deviceId).then((prefs) => {
      if (prefs) setAutoRerouteOn(prefs.auto_reroute);
    });
  }, [deviceId]);

  const togglePush = async (next: boolean) => {
    if (!deviceId) return;

    if (next && push !== 'granted') {
      const permission = await requestPushPermission();
      setPush(permission);
      if (permission !== 'granted') {
        // The OS refused and will not ask again — the only remaining path is system settings.
        if (permission === 'denied') void Linking.openSettings();
        return;
      }
      await registerForPush(deviceId);
      setPushOn(true);
      return;
    }

    // Turning push off is OUR setting, not the OS's: revoking the system permission is not
    // something an app can do, and a driver who wants quiet should not have to leave the app.
    setPushOn(next);
    await setPushEnabled(deviceId, next);
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Settings' }} />

      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Push notifications</Text>
            <Text style={styles.hint}>
              {push === 'denied'
                ? 'Blocked in system settings. The in-app inbox still works while the app is open.'
                : 'Route alerts and messages from the RailRover team.'}
            </Text>
          </View>
          <Switch
            value={pushOn}
            onValueChange={(next) => void togglePush(next)}
            trackColor={{ true: palette.accent, false: palette.border }}
          />
        </View>
      </View>

      {/* SOW M1-Settings AC2: on by default, with an explicit way to be prompted instead. */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Reroute automatically</Text>
            <Text style={styles.hint}>
              {autoReroute
                ? 'When a blocked crossing is found ahead, RailRover offers a way around it straight away.'
                : 'You will be asked first each time a blocked crossing is found ahead.'}
            </Text>
          </View>
          <Switch
            value={autoReroute}
            onValueChange={(next) => {
              setAutoRerouteOn(next);
              if (deviceId) void setAutoReroute(deviceId, next);
            }}
            trackColor={{ true: palette.accent, false: palette.border }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.rowText}>
          <Text style={styles.label}>Location</Text>
          <Text style={styles.hint}>
            {locationPermission === 'granted'
              ? 'Granted. Used to centre the map, pick the nearest crossing, and check your route.'
              : 'Needed to centre the map, pick the nearest crossing when you report one, and warn you about crossings ahead.'}
          </Text>
        </View>
        {locationPermission !== 'granted' ? (
          <Button
            label={locationPermission === 'denied' ? 'Open settings' : 'Enable location'}
            variant="secondary"
            onPress={
              locationPermission === 'denied'
                ? () => void Linking.openSettings()
                : () => void startLocation()
            }
          />
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.hint}>
          {status === 'guest'
            ? 'You are using RailRover as a guest. Your reports are tied to this device.'
            : 'Signed in. Your reports and settings follow your account.'}
        </Text>
        {status === 'guest' ? (
          <Button
            label="Create an account"
            variant="secondary"
            onPress={() => router.push('/sign-up')}
          />
        ) : null}
        <Button
          label="Sign out"
          variant="ghost"
          onPress={() => {
            void signOut().then(() => router.replace('/'));
          }}
        />

        {/*
          SOW M1-Settings AC3, and a hard store-submission requirement on both platforms. Two taps
          because it is irreversible, and the copy says exactly what survives rather than implying
          everything disappears — the reports stay, with the link to the person severed.
        */}
        {confirmDelete ? (
          <>
            <Text style={styles.hint}>
              This cannot be undone. Your account and settings are deleted. The crossing reports
              you submitted stay, with nothing linking them to you — removing them would change
              what other drivers see at those crossings.
            </Text>
            <Button
              label="Permanently delete my account"
              onPress={() => {
                void deleteAccount()
                  .then(() => signOut())
                  .then(() => router.replace('/'));
              }}
            />
            <Button label="Cancel" variant="ghost" onPress={() => setConfirmDelete(false)} />
          </>
        ) : (
          <Button label="Delete my account" variant="ghost" onPress={() => setConfirmDelete(true)} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background, padding: 16, gap: 14 },
  card: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    padding: 16,
    gap: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  rowText: { flex: 1, gap: 4 },
  label: { color: palette.text, fontSize: 16, fontWeight: '600' },
  hint: { color: palette.textMuted, fontSize: 13, lineHeight: 19 },
});
