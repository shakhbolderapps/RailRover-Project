import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metersToMiles, type CrossingStatus, type ReportStatus } from '@railrover/shared';

import { Button } from '@/components/Button';
import { palette, statusColors } from '@/theme/colors';
import { useSession } from '@/stores/session';
import { useLocation } from '@/stores/location';
import { fetchNearestCrossing, submitReport, type NearestCrossing } from '@/lib/reports';
import type { CrossingRow } from '@/lib/crossings';

interface Props {
  status: ReportStatus;
  /** Set when reporting a specific crossing from its detail view; otherwise the nearest is used. */
  crossing?: CrossingRow;
  onClose: () => void;
  onReported: (crossing: CrossingStatus) => void;
}

type Phase =
  | { kind: 'locating' }
  | { kind: 'confirm'; crossing: CrossingRow; metersAway: number | null }
  | { kind: 'submitting'; crossing: CrossingRow }
  | { kind: 'done'; crossing: CrossingRow }
  | { kind: 'blocked'; title: string; detail: string };

/**
 * The report flow (SOW M3): two taps, under five seconds, while driving.
 *
 * Tap one opens this sheet and auto-selects the nearest crossing; tap two confirms. There is no
 * note field and no crossing picker — the SOW is explicit about both, and it is right: a driver
 * doing this at a level crossing is not going to read a list.
 */
export function ReportSheet({ status, crossing, onClose, onReported }: Props) {
  const insets = useSafeAreaInsets();
  const deviceId = useSession((s) => s.deviceId);
  const fix = useLocation((s) => s.fix);

  const [phase, setPhase] = useState<Phase>(
    crossing ? { kind: 'confirm', crossing, metersAway: null } : { kind: 'locating' },
  );

  const isBlocked = status === 'blocked';
  const accent = isBlocked ? statusColors.red : statusColors.green;

  // Auto-select the nearest crossing. Skipped entirely when the driver opened this from a
  // specific crossing's detail view — they already chose.
  useEffect(() => {
    if (crossing) return;

    if (!fix) {
      setPhase({
        kind: 'blocked',
        title: 'Waiting for your location',
        detail:
          'RailRover needs your position to know which crossing you are at. Check that location ' +
          'is enabled, then try again.',
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const nearest: NearestCrossing | null = await fetchNearestCrossing(
          fix.latitude,
          fix.longitude,
        );
        if (cancelled) return;

        if (!nearest) {
          // Not the driver's mistake. The system is saying: you cannot see a crossing from here.
          setPhase({
            kind: 'blocked',
            title: 'No crossing within reporting range',
            detail:
              'You are more than about a mile from any known crossing, so there is nothing here ' +
              'to report on. Reports are limited to crossings you can actually see.',
          });
          return;
        }

        setPhase({ kind: 'confirm', crossing: nearest, metersAway: nearest.meters_away });
      } catch {
        if (cancelled) return;
        setPhase({
          kind: 'blocked',
          title: 'Could not reach RailRover',
          detail: 'Check your connection and try again.',
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [crossing, fix]);

  const confirm = async () => {
    if (phase.kind !== 'confirm' || !deviceId || !fix) return;
    const target = phase.crossing;
    setPhase({ kind: 'submitting', crossing: target });

    try {
      const result = await submitReport({
        crossingId: target.id,
        status,
        deviceId,
        latitude: fix.latitude,
        longitude: fix.longitude,
      });

      if (result.ok) {
        onReported(result.crossing);
        setPhase({ kind: 'done', crossing: target });
        return;
      }

      // Every rejection reason carries copy written for a driver, from the RPC (ADR 0004).
      setPhase({
        kind: 'blocked',
        title: result.reason === 'rate_limited' ? 'Too many reports' : 'Report not accepted',
        detail: result.message,
      });
    } catch {
      setPhase({
        kind: 'blocked',
        title: 'Could not submit',
        detail: 'Check your connection and try again.',
      });
    }
  };

  return (
    <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
      <View style={[styles.banner, { backgroundColor: accent }]}>
        <Text style={styles.bannerText}>
          {isBlocked ? 'Reporting BLOCKED' : 'Reporting CLEAR'}
        </Text>
      </View>

      {phase.kind === 'locating' ? (
        <View style={styles.row}>
          <ActivityIndicator color={palette.textMuted} />
          <Text style={styles.body}>Finding the nearest crossing…</Text>
        </View>
      ) : null}

      {phase.kind === 'confirm' || phase.kind === 'submitting' ? (
        <>
          <Text style={styles.label}>Nearest crossing</Text>
          <Text style={styles.title}>
            {phase.crossing.name ?? phase.crossing.road ?? phase.crossing.dot_id}
          </Text>
          {phase.kind === 'confirm' && phase.metersAway !== null ? (
            <Text style={styles.body}>
              {metersToMiles(phase.metersAway) < 0.1
                ? 'Right here'
                : `${metersToMiles(phase.metersAway).toFixed(1)} miles away`}
            </Text>
          ) : null}

          <Button
            label={isBlocked ? 'Confirm blocked' : 'Confirm clear'}
            onPress={() => void confirm()}
            loading={phase.kind === 'submitting'}
            style={{ backgroundColor: accent }}
          />
          <Button label="Cancel" variant="ghost" onPress={onClose} />
        </>
      ) : null}

      {phase.kind === 'done' ? (
        <>
          <Text style={[styles.title, { color: accent }]}>
            {isBlocked ? 'Reported as blocked' : 'Reported as clear'}
          </Text>
          <Text style={styles.body}>
            Thanks — {phase.crossing.name ?? phase.crossing.dot_id} is updated for every driver
            nearby.
          </Text>
          <Button label="Done" onPress={onClose} />
        </>
      ) : null}

      {phase.kind === 'blocked' ? (
        <>
          <Text style={styles.title}>{phase.title}</Text>
          <Text style={styles.body}>{phase.detail}</Text>
          <Button label="Close" variant="secondary" onPress={onClose} />
        </>
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
    gap: 12,
  },
  banner: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bannerText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.8 },
  label: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  title: { color: palette.text, fontSize: 22, fontWeight: '700' },
  body: { color: palette.textMuted, fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
});
