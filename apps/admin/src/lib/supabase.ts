import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * The admin panel's Supabase client.
 *
 * Uses the PUBLISHABLE key, exactly like the mobile app. Administrative power comes from the
 * signed-in account's `profiles.role`, enforced by RLS and by the `is_admin()` check inside every
 * admin RPC — never from a privileged key shipped to a browser. SOW M5 is explicit that admin
 * access is enforced by role rather than by hiding a route, and a service-role key in frontend
 * JavaScript would make that guarantee meaningless.
 *
 * Constructed lazily for the same reason as the mobile client: createClient throws on an empty
 * URL, and a misconfigured build should show a setup message rather than a blank page.
 */
let client: SupabaseClient | null = null;

export const config = {
  url: import.meta.env.VITE_SUPABASE_URL ?? '',
  anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
};

export const isConfigured = (): boolean => config.url.length > 0 && config.anonKey.length > 0;

export function getSupabase(): SupabaseClient {
  if (client) return client;
  client = createClient(config.url, config.anonKey);
  return client;
}
