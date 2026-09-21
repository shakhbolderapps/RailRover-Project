import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';

import { getSupabase } from '@/lib/supabase';

/**
 * Notifications (SOW M1 "Notifications").
 *
 * The in-app inbox is the part that always works. Push DELIVERY needs credentials this project
 * does not own yet — a real Firebase project for Android FCM, and the Apple Developer Program for
 * iOS APNs — so the inbox is deliberately not built on top of push. The SOW's own edge case says
 * as much: "Push permission is denied -> Alerts and messages remain available in the in-app inbox
 * while the app is active."
 */

export type PushPermission = 'undetermined' | 'granted' | 'denied';

export interface InboxItem {
  id: string;
  kind: 'route_alert' | 'broadcast';
  title: string;
  body: string;
  crossing_id: string | null;
  created_at: string;
  read_at: string | null;
}

export const toPushPermission = (response: {
  granted: boolean;
  canAskAgain: boolean;
}): PushPermission => {
  if (response.granted) return 'granted';
  return response.canAskAgain ? 'undetermined' : 'denied';
};

export async function getPushPermission(): Promise<PushPermission> {
  return toPushPermission(await Notifications.getPermissionsAsync());
}

export async function requestPushPermission(): Promise<PushPermission> {
  return toPushPermission(await Notifications.requestPermissionsAsync());
}

/**
 * Fetch the Expo push token and store it against this device.
 *
 * Returns null rather than throwing when a token cannot be obtained. On a build without real FCM
 * credentials — which is every build until the client provides a Firebase project — this call
 * fails, and a driver should still reach the map with a working inbox rather than an error.
 */
export async function registerForPush(deviceId: string): Promise<string | null> {
  const permission = await getPushPermission();
  if (permission !== 'granted') return null;

  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const token = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId: String(projectId) } : undefined,
    );

    await getSupabase().rpc('register_push_token', {
      p_device_id: deviceId,
      p_token: token.data,
      p_enabled: true,
    });

    return token.data;
  } catch {
    return null;
  }
}

/** Turn push off without revoking the OS permission (SOW M1-Notifications-AC4). */
export async function setPushEnabled(deviceId: string, enabled: boolean): Promise<void> {
  await getSupabase().rpc('register_push_token', {
    p_device_id: deviceId,
    p_token: null,
    p_enabled: enabled,
  });
}

/** The driver's inbox, unread first then newest (ordering is the RPC's). */
export async function fetchInbox(): Promise<InboxItem[]> {
  const { data, error } = await getSupabase().rpc('inbox');
  if (error) throw new Error(error.message);
  return (data ?? []) as InboxItem[];
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const { error } = await getSupabase().rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) throw new Error(error.message);
}

/**
 * Group notifications that arrived close together (SOW M1-Notifications edge case: "Several
 * notifications arrive together -> System groups them in the inbox").
 *
 * Grouped by kind within a time bucket, because that is what "together" means to a driver: three
 * route alerts in the same minute are one event to them, while a broadcast that happens to land in
 * the same minute is not part of it.
 */
export const GROUPING_WINDOW_MS = 60_000;

export interface InboxGroup {
  key: string;
  kind: InboxItem['kind'];
  items: InboxItem[];
  unread: number;
}

export function groupInbox(items: InboxItem[], windowMs = GROUPING_WINDOW_MS): InboxGroup[] {
  const groups: InboxGroup[] = [];

  for (const item of items) {
    const at = new Date(item.created_at).getTime();
    const last = groups[groups.length - 1];
    const lastAt = last ? new Date(last.items[last.items.length - 1]!.created_at).getTime() : 0;

    // Consecutive only: the list is already ordered, so a run is broken by anything that does not
    // belong to it rather than by scanning the whole list for matches.
    if (last && last.kind === item.kind && Math.abs(lastAt - at) <= windowMs) {
      last.items.push(item);
      if (!item.read_at) last.unread += 1;
      continue;
    }

    groups.push({
      key: item.id,
      kind: item.kind,
      items: [item],
      unread: item.read_at ? 0 : 1,
    });
  }

  return groups;
}
