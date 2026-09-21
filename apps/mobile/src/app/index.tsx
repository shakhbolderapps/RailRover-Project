import { Redirect } from 'expo-router';

import { useSession } from '@/stores/session';

/**
 * Entry point. Sends a driver with any session — guest or account — straight to the map, and
 * everyone else to the welcome screen.
 *
 * The `loading` case never renders here: _layout.tsx holds the spinner until the stored session
 * has been restored, so this never flashes the welcome screen at a returning driver.
 */
export default function Index() {
  const status = useSession((s) => s.status);

  if (status === 'signed-out') return <Redirect href="/welcome" />;
  return <Redirect href="/map" />;
}
