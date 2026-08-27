import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-url-polyfill/auto';

import { palette } from '@/theme/colors';

/**
 * Root layout — identical on iOS and Android.
 *
 * SafeAreaProvider and GestureHandlerRootView are mounted here rather than per-screen because
 * both platforms need them and iOS in particular breaks subtly without SafeAreaProvider at the
 * root (notch insets resolve to zero). Keeping them here means the iOS path is correct by
 * construction rather than by a later fix.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.background }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: palette.surface },
            headerTintColor: palette.text,
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: palette.background },
          }}
        >
          <Stack.Screen name="index" options={{ title: 'RailRover' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
