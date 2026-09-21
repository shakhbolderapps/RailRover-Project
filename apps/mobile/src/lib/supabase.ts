import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/lib/env';

/**
 * The single Supabase client. Everything that touches the backend goes through this.
 *
 * Constructed LAZILY and never at import time. `createClient` throws on an empty URL, and this
 * module is imported transitively by the root layout — so building it eagerly would crash the app
 * during module evaluation on any build with missing configuration, before the setup screen could
 * render. That is exactly the white-screen failure mode lib/env.ts is written to avoid, and it is
 * invisible in development because a configured .env hides it.
 *
 * `detectSessionInUrl: false` because that is a browser concern — leaving it on makes the client
 * reach for `window.location` on React Native.
 *
 * The session lives in AsyncStorage rather than SecureStore: Supabase sessions routinely exceed
 * SecureStore's 2 KB per-value limit (a JWT plus a refresh token), and a silent truncation would
 * present as an unexplained sign-out. AsyncStorage is what Supabase documents for React Native.
 * The device identifier, which is small and is the identity behind guest reports, does go in
 * SecureStore — see lib/device.ts.
 *
 * NOTE: this uses the PUBLISHABLE key, which is safe to ship in the bundle. Row Level Security is
 * what actually protects the data, and `submit_report` is the only write path into reports
 * (ADR 0004). The secret key must never appear in this app.
 */
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  client = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      storage: AsyncStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
