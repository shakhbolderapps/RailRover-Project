import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatRelativeTime, metersToMiles } from '@railrover/shared';

import { Button } from '@/components/Button';
import { palette, statusColors } from '@/theme/colors';
import type { RouteConflictRow } from '@/lib/conflicts';

interface Props {
  conflict: RouteConflictRow;
  /** How many conflicts are ahead in total, so the driver knows this is not the only one. */
  totalAhead: number;
  rerouting: boolean;
  rerouteMessage: string | null;
  onReroute: () => void;
  onKeepRoute: () => void;
}

/**
 * The blocked-crossing alert (SOW M4 "Blocked Crossing Alert").
 *
 * Deliberately NOT a countdown that auto-reroutes. The SOW allows auto-reroute when the driver has
 * opted in, but the default here is an explicit choice: silently changing someone's route while
 * they are driving, on the strength of one stranger's report, is a bigger claim than the data
 * supports. Rerouting is offered, prepared in the background so it is instant, and taken on a tap.
 *
 * The crossing name, the report age and the distance are all shown because a driver deciding
 * whether to detour needs to weigh them — "blocked 12 minutes ago, 4.2 miles ahead" is a
 * different decision from "blocked 1 minute ago, 300 feet ahead".
 */
export function ConflictAlert({
  conflict,
  totalAhead,
  rerouting,
  rerouteMessage,
  onReroute,
  onKeepRoute,
}: Props) {
  const insets = useSafeAreaInsets();
  const reported = formatRelativeTime(conflict.last_reported_at);
  const miles = metersToMiles(conflict.meters_ahead);

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.banner}>
        <Text style={styles.bannerText}>BLOCKED CROSSING AHEAD</Text>
      </View>

      <Text style={styles.title}>{conflict.name ?? conflict.road ?? conflict.dot_id}</Text>
      <Text style={styles.detail}>
        {miles < 0.1 ? 'Just ahead' : `${miles.toFixed(1)} miles ahead`}
        {reported ? ` · reported ${reported}` : ''}
      </Text>

      {totalAhead > 1 ? (
        <Text style={styles.more}>
          {totalAhead - 1} more blocked crossing{totalAhead - 1 === 1 ? '' : 's'} on this route
        </Text>
      ) : null}

      {rerouteMessage ? <Text style={styles.message}>{rerouteMessage}</Text> : null}

      <View style={styles.actions}>
        <Button
          label={rerouting ? 'Finding a way around…' : 'Route around it'}
          onPress={onReroute}
          loading={rerouting}
        />
        <Button label="Keep my route" variant="secondary" onPress={onKeepRoute} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: 2,
    borderColor: statusColors.red,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 8,
  },
  banner: {
    alignSelf: 'flex-start',
    backgroundColor: statusColors.red,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bannerText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  title: { color: palette.text, fontSize: 24, fontWeight: '700' },
  detail: { color: palette.textMuted, fontSize: 15, lineHeight: 21 },
  more: { color: statusColors.yellow, fontSize: 13, fontWeight: '600' },
  message: { color: palette.textMuted, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
  actions: { gap: 8, marginTop: 6 },
});
