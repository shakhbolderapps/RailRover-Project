import Constants from 'expo-constants';

/**
 * Runtime configuration, read from app.config.ts `extra` (which reads the environment).
 *
 * Deliberately does NOT throw on missing values at import time — the app must boot and show a
 * useful diagnostic screen rather than white-screening, which is what a top-level throw produces
 * in a release build.
 */
interface Extra {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  orsApiKey?: string;
}

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

/**
 * Prefer the EXPO_PUBLIC_* value, fall back to `extra`.
 *
 * Expo's Babel transform inlines EXPO_PUBLIC_* variables into the JS bundle, which Metro rebuilds
 * on every start — so changing a key is a Metro restart. `extra` travels in the app config, and a
 * debug build made with `expo run:android` embeds the config it was BUILT with: a key added after
 * that build reads as empty forever, surviving both a force-stop and `pm clear`. That cost a long
 * debugging detour when the OpenRouteService key was added, and would have meant a 25-minute
 * native rebuild for a one-line config change.
 *
 * `extra` is kept as the fallback because it is what a production build resolves at build time.
 */
const read = (inlined: string | undefined, fromExtra: string | undefined): string =>
  inlined && inlined.length > 0 ? inlined : (fromExtra ?? '');

export const env = {
  supabaseUrl: read(process.env.EXPO_PUBLIC_SUPABASE_URL, extra.supabaseUrl),
  supabaseAnonKey: read(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, extra.supabaseAnonKey),
  orsApiKey: read(process.env.EXPO_PUBLIC_ORS_API_KEY, extra.orsApiKey),
} as const;

export interface ConfigCheck {
  key: string;
  label: string;
  present: boolean;
  hint: string;
}

/** Which configuration is missing, for the setup screen. */
export function checkConfig(): ConfigCheck[] {
  return [
    {
      key: 'EXPO_PUBLIC_SUPABASE_URL',
      label: 'Supabase URL',
      present: env.supabaseUrl.length > 0,
      hint: 'Create a free Supabase project and copy its Project URL.',
    },
    {
      key: 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
      label: 'Supabase anon key',
      present: env.supabaseAnonKey.length > 0,
      hint: 'Settings → API → anon/public key. Never the service_role key.',
    },
    {
      key: 'EXPO_PUBLIC_ORS_API_KEY',
      label: 'OpenRouteService key',
      present: env.orsApiKey.length > 0,
      hint: 'Free key from openrouteservice.org — 2,000 routes/day. Not needed until Phase 5.',
    },
  ];
}

export const isConfigured = (): boolean =>
  env.supabaseUrl.length > 0 && env.supabaseAnonKey.length > 0;
