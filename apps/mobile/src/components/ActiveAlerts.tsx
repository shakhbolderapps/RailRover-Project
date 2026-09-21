import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette, statusColors } from '@/theme/colors';
import type { ActiveAlert } from '@/lib/active-alerts';

interface Props {
  alerts: ActiveAlert[];
  onSelect: (crossingId: string) => void;
  onClose: () => void;
}

/** SOW M4 "Active Alerts": everything currently relevant, on-route first, in one place. */
export function ActiveAlerts({ alerts, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Active alerts</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close active alerts">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      {alerts.length === 0 ? (
        <Text style={styles.empty}>
          Nothing blocked nearby or on your route right now. Crossings you pass will appear here if
          another driver reports them.
        </Text>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {alerts.map((alert) => (
            <Pressable
              key={alert.crossingId}
              onPress={() => onSelect(alert.crossingId)}
              style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
            >
              <View style={styles.dot} />
              <View style={styles.rowText}>
                <Text style={styles.name}>{alert.name}</Text>
                <Text style={styles.meta}>
                  {[alert.onRoute ? alert.distanceLabel : 'Nearby', alert.reportedLabel]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
              {alert.onRoute ? <Text style={styles.tag}>ON ROUTE</Text> : null}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    maxHeight: '60%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: palette.text, fontSize: 20, fontWeight: '700' },
  close: { color: palette.textMuted, fontSize: 18, fontWeight: '600' },
  empty: { color: palette.textMuted, fontSize: 15, lineHeight: 22, paddingBottom: 8 },
  list: { flexGrow: 0 },
  listContent: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: palette.surfaceRaised,
    borderRadius: 12,
    padding: 14,
  },
  rowPressed: { opacity: 0.75 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: statusColors.red },
  rowText: { flex: 1, gap: 2 },
  name: { color: palette.text, fontSize: 16, fontWeight: '600' },
  meta: { color: palette.textMuted, fontSize: 13 },
  tag: {
    color: statusColors.red,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
