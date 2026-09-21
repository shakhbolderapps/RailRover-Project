import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { describeColor, formatRelativeTime } from '@railrover/shared';

import { palette, statusColors } from '@/theme/colors';
import type { CrossingRow } from '@/lib/crossings';

interface Props {
  crossing: CrossingRow;
  onClose: () => void;
}

/**
 * Crossing detail (SOW M2 "Crossing Detail" AC1: status, last report time, report count).
 *
 * AC2 (whether the crossing is on the active route) needs route conflict detection, and AC3
 * (report from here) needs the report flow — Phase 6 and Phase 4 respectively. Neither is stubbed
 * with a dead control here: a button that does nothing is worse than an absent one.
 */
export function CrossingDetail({ crossing, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const lastReport = formatRelativeTime(crossing.last_reported_at);

  const location = [crossing.city, crossing.state].filter(Boolean).join(', ');

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: statusColors[crossing.color] }]} />
            <Text style={[styles.status, { color: statusColors[crossing.color] }]}>
              {describeColor(crossing.color)}
            </Text>
          </View>
          <Text style={styles.title}>{crossing.name ?? crossing.road ?? crossing.dot_id}</Text>
          {location ? <Text style={styles.subtitle}>{location}</Text> : null}
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close crossing detail"
          hitSlop={12}
          style={styles.close}
        >
          <Text style={styles.closeText}>✕</Text>
        </Pressable>
      </View>

      <View style={styles.facts}>
        <Fact
          label="Last report"
          // The edge case the SOW calls out: no reports is "unconfirmed with no recent report
          // time", which is NOT the same as clear. Saying "never" states that plainly.
          value={lastReport ?? 'No reports yet'}
        />
        <Fact
          label="Reports"
          value={`${crossing.report_count}`}
        />
      </View>

      {crossing.railroad ? <Text style={styles.railroad}>{crossing.railroad}</Text> : null}
      <Text style={styles.dotId}>FRA crossing {crossing.dot_id}</Text>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
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
    gap: 14,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  titleBlock: { flex: 1, gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  status: { fontSize: 13, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  title: { color: palette.text, fontSize: 22, fontWeight: '700' },
  subtitle: { color: palette.textMuted, fontSize: 14 },
  close: { padding: 4 },
  closeText: { color: palette.textMuted, fontSize: 18, fontWeight: '600' },
  facts: { flexDirection: 'row', gap: 12 },
  fact: {
    flex: 1,
    backgroundColor: palette.surfaceRaised,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 4,
  },
  factLabel: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  factValue: { color: palette.text, fontSize: 16, fontWeight: '600' },
  railroad: { color: palette.textMuted, fontSize: 13 },
  dotId: { color: palette.textMuted, fontSize: 11 },
});
