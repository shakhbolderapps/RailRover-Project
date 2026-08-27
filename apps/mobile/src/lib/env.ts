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

export const env = {
  supabaseUrl: extra.supabaseUrl ?? '',
  supabaseAnonKey: extra.supabaseAnonKey ?? '',
  orsApiKey: extra.orsApiKey ?? '',
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
