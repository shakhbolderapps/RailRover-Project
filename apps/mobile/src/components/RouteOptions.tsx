import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metersToMiles, type RouteOption } from '@railrover/shared';

import { Button } from '@/components/Button';
import { palette, statusColors } from '@/theme/colors';

interface Props {
  options: RouteOption[];
  selectedId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const minutes = (seconds: number) => Math.max(1, Math.round(seconds / 60));

/**
 * Route options (SOW M4-AC2).
 *
 * The crossing counts are the reason this screen exists. Travel time alone makes two routes look
 * interchangeable; "23 min · 6 crossings" against "26 min · 1 crossing" is the trade the SOW
 * explicitly wants a driver to be able to make, so the counts are given the same visual weight as
 * the time rather than tucked underneath it.
 */
export function RouteOptions({ options, selectedId, loading, error, onSelect, onClose }: Props) {
  const insets = useSafeAreaInsets();

  const fewest = options.length > 0 ? Math.min(...options.map((o) => o.totalCrossings)) : 0;
  const quickest = options.length > 0 ? Math.min(...options.map((o) => o.durationSeconds)) : 0;

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Route options</Text>
        <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close route options">
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.row}>
          <ActivityIndicator color={palette.textMuted} />
          <Text style={styles.body}>Working out your options…</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {options.map((option) => {
        const selected = option.id === selectedId;
        return (
          <Pressable
            key={option.id}
            onPress={() => onSelect(option.id)}
            style={[styles.card, selected ? styles.cardSelected : null]}
          >
            <View style={styles.cardTop}>
              <Text style={styles.duration}>{minutes(option.durationSeconds)} min</Text>
              <Text style={styles.distance}>
                {metersToMiles(option.distanceMeters).toFixed(1)} mi
              </Text>
              {option.durationSeconds === quickest ? (
                <Text style={styles.tag}>Quickest</Text>
              ) : null}
              {option.totalCrossings === fewest && options.length > 1 ? (
                <Text style={styles.tag}>Fewest crossings</Text>
              ) : null}
            </View>

            <View style={styles.counts}>
              <Text style={styles.count}>
                {option.totalCrossings} crossing{option.totalCrossings === 1 ? '' : 's'}
              </Text>
              {option.blockedCrossings > 0 ? (
                <Text style={[styles.count, styles.blocked]}>
                  {option.blockedCrossings} blocked now
                </Text>
              ) : (
                <Text style={[styles.count, styles.clear]}>None blocked now</Text>
              )}
            </View>
          </Pressable>
        );
      })}

      {options.length > 0 ? (
        <Button label="Start with this route" onPress={onClose} />
      ) : null}
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
    gap: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: palette.text, fontSize: 20, fontWeight: '700' },
  close: { color: palette.textMuted, fontSize: 18, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  body: { color: palette.textMuted, fontSize: 15 },
  error: { color: statusColors.red, fontSize: 14, lineHeight: 20 },
  card: {
    backgroundColor: palette.surfaceRaised,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 14,
    gap: 8,
  },
  cardSelected: { borderColor: palette.text },
  cardTop: { flexDirection: 'row', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  duration: { color: palette.text, fontSize: 20, fontWeight: '700' },
  distance: { color: palette.textMuted, fontSize: 14 },
  tag: {
    color: palette.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  counts: { flexDirection: 'row', gap: 14, flexWrap: 'wrap' },
  count: { color: palette.text, fontSize: 14, fontWeight: '600' },
  blocked: { color: statusColors.red },
  clear: { color: statusColors.green },
});
