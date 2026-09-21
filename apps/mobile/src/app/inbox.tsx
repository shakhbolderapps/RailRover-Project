import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { formatRelativeTime } from '@railrover/shared';

import { palette, statusColors } from '@/theme/colors';
import {
  fetchInbox,
  groupInbox,
  markNotificationRead,
  type InboxGroup,
  type InboxItem,
} from '@/lib/notifications';

/**
 * The in-app inbox (SOW M1 "Notifications" AC2/AC3).
 *
 * Works whether or not push is permitted — that is the point of it. The SOW's edge case requires
 * alerts and messages to stay available in the inbox when push is denied, so nothing here depends
 * on a push token, a Firebase project, or an Apple Developer account.
 */
export default function InboxScreen() {
  const [groups, setGroups] = useState<InboxGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(groupInbox(await fetchInbox()));
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load your notifications.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async (item: InboxItem) => {
    // Marked read optimistically: a driver who taps an item has read it, and making them wait for
    // a round trip to see the badge clear would be worse than being briefly wrong.
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        items: group.items.map((existing) =>
          existing.id === item.id
            ? { ...existing, read_at: existing.read_at ?? new Date().toISOString() }
            : existing,
        ),
        unread: group.items.some((existing) => existing.id === item.id && !existing.read_at)
          ? Math.max(0, group.unread - 1)
          : group.unread,
      })),
    );

    void markNotificationRead(item.id);

    // SOW M1-Notifications-AC3: a notification opens the thing it is about.
    if (item.crossing_id) router.replace('/map');
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: 'Notifications' }} />

      {loading ? (
        <View style={styles.centre}>
          <ActivityIndicator color={palette.textMuted} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => void load()} tintColor={palette.textMuted} />
          }
        >
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {groups.length === 0 && !error ? (
            <Text style={styles.empty}>
              No notifications yet. Route alerts and messages from the RailRover team will appear
              here.
            </Text>
          ) : null}

          {groups.map((group) => (
            <View key={group.key} style={styles.group}>
              {group.items.length > 1 ? (
                <Text style={styles.groupLabel}>
                  {group.items.length} {group.kind === 'route_alert' ? 'route alerts' : 'messages'}
                  {group.unread > 0 ? ` · ${group.unread} unread` : ''}
                </Text>
              ) : null}

              {group.items.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => void open(item)}
                  style={({ pressed }) => [
                    styles.item,
                    !item.read_at ? styles.itemUnread : null,
                    pressed ? styles.itemPressed : null,
                  ]}
                >
                  {!item.read_at ? <View style={styles.unreadDot} /> : null}
                  <View style={styles.itemText}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemBody}>{item.body}</Text>
                    <Text style={styles.itemMeta}>
                      {formatRelativeTime(item.created_at) ?? ''}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14 },
  error: { color: statusColors.red, fontSize: 14, lineHeight: 20 },
  empty: { color: palette.textMuted, fontSize: 15, lineHeight: 22, paddingTop: 8 },
  group: { gap: 6 },
  groupLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    paddingHorizontal: 4,
  },
  item: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    padding: 14,
  },
  itemUnread: { borderColor: palette.accent },
  itemPressed: { opacity: 0.8 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: palette.accent,
    marginTop: 6,
  },
  itemText: { flex: 1, gap: 3 },
  itemTitle: { color: palette.text, fontSize: 16, fontWeight: '600' },
  itemBody: { color: palette.textMuted, fontSize: 14, lineHeight: 20 },
  itemMeta: { color: palette.textMuted, fontSize: 12, marginTop: 2 },
});
