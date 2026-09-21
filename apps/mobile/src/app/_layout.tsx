import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';

import { palette } from '@/theme/colors';
import { isConfigured } from '@/lib/env';
import { useSession } from '@/stores/session';
import { SetupNotice } from '@/components/SetupNotice';

/**
 * Root layout — identical on iOS and Android.
 *
 * SafeAreaProvider and GestureHandlerRootView are mounted here rather than per-screen because
 * both platforms need them and iOS in particular breaks subtly without SafeAreaProvider at the
 * root (notch insets resolve to zero). Keeping them here means the iOS path is correct by
 * construction rather than by a later fix.
 */
export default function RootLayout() {
  const initialize = useSession((s) => s.initialize);
  const status = useSession((s) => s.status);
  const configured = isConfigured();

  useEffect(() => {
    if (configured) void initialize();
  }, [configured, initialize]);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        {!configured ? (
          <SetupNotice />
        ) : status === 'loading' ? (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.textMuted} />
          </View>
        ) : (
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: palette.surface },
              headerTintColor: palette.text,
              headerTitleStyle: { fontWeight: '600' },
              contentStyle: { backgroundColor: palette.background },
            }}
          >
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="welcome" options={{ headerShown: false }} />
            <Stack.Screen name="map" options={{ headerShown: false }} />
            <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
            <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
          </Stack>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.background },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.background,
  },
});
