import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Constants from 'expo-constants';

import { palette, statusColors } from '@/theme/colors';
import { checkConfig, isConfigured } from '@/lib/env';
import {
  DEFAULT_APP_CONFIG,
  DEFAULT_ROUTE_CORRIDOR_FEET,
  computeCrossingColor,
  describeColor,
  metersToFeet,
} from '@railrover/shared';

/**
 * Phase 0 boot screen.
 *
 * This is scaffolding, not a product screen — it exists to satisfy the Phase 0 QA gate: a fresh
 * clone runs, the shared package resolves on device, and the operational defaults are the ones
 * the SOW specifies. The live map (SOW M2) replaces it in Phase 3.
 *
 * Renders identically on iOS and Android. The only platform-aware line is the OS label, which
 * has both arms.
 */
export default function BootScreen() {
  const insets = useSafeAreaInsets();
  const configured = isConfigured();
  const checks = checkConfig();

  const now = new Date();
  const demoStatuses = [
    { label: 'Fresh blocked report (2 min ago)', minutesAgo: 2, status: 'blocked' as const },
    { label: 'Blocked, aged out (20 min ago)', minutesAgo: 20, status: 'blocked' as const },
    { label: 'Clear report', minutesAgo: 5, status: 'clear' as const },
    { label: 'No reports yet', minutesAgo: null, status: null },
  ];

  const platformLabel = Platform.select({
    ios: `iOS ${Platform.Version}`,
    android: `Android API ${Platform.Version}`,
    default: 'Unknown platform',
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
    >
      <Text style={styles.title}>RailRover</Text>
      <Text style={styles.subtitle}>
        Phase 0 — foundation and guardrails. Running on {platformLabel}.
      </Text>

      <Section title="Build target">
        <Row label="Platform" value={platformLabel} />
        <Row label="App version" value={Constants.expoConfig?.version ?? '—'} />
        <Row label="Bundle ID" value="com.bolderapps.railrover" />
        <Row
          label="iOS parity"
          value="One codebase, both targets"
          valueColor={statusColors.green}
        />
      </Section>

      {/*
        Proves the platform-free shared package resolves and runs on device — the same
        computeCrossingColor() the SQL view mirrors, and the same one the unit tests cover.
      */}
      <Section title="Crossing status logic (shared package)">
        {demoStatuses.map((demo) => {
          const color = computeCrossingColor({
            lastStatus: demo.status,
            lastReportedAt:
              demo.minutesAgo === null ? null : new Date(now.getTime() - demo.minutesAgo * 60_000),
            now,
            freshnessWindowMinutes: DEFAULT_APP_CONFIG.freshnessWindowMinutes,
          });
          return (
            <View key={demo.label} style={styles.statusRow}>
              <View style={[styles.dot, { backgroundColor: statusColors[color] }]} />
              <View style={styles.statusText}>
                <Text style={styles.statusLabel}>{demo.label}</Text>
                <Text style={styles.statusValue}>
                  {color} — {describeColor(color)}
                </Text>
              </View>
            </View>
          );
        })}
      </Section>

      <Section title="Operational defaults (tuned during the pilot)">
        <Row
          label="Freshness window"
          value={`${DEFAULT_APP_CONFIG.freshnessWindowMinutes} min`}
        />
        <Row
          label="Route corridor WIDTH"
          value={`${DEFAULT_ROUTE_CORRIDOR_FEET} ft (${DEFAULT_APP_CONFIG.routeCorridorMeters.toFixed(2)} m)`}
        />
        <Row
          label="Report radius"
          value={`${metersToFeet(DEFAULT_APP_CONFIG.reportRadiusMeters).toFixed(0)} ft (1 mi)`}
        />
        <Text style={styles.note}>
          The corridor is a width, not an alert distance. A fresh blocked crossing is flagged
          however far ahead it sits.
        </Text>
      </Section>

      <Section title="Backend configuration">
        {checks.map((check) => (
          <View key={check.key} style={styles.checkRow}>
            <Text
              style={[
                styles.checkMark,
                { color: check.present ? statusColors.green : statusColors.yellow },
              ]}
            >
              {check.present ? '✓' : '○'}
            </Text>
            <View style={styles.statusText}>
              <Text style={styles.statusLabel}>{check.label}</Text>
              <Text style={styles.statusValue}>{check.present ? 'Set' : check.hint}</Text>
            </View>
          </View>
        ))}
        {!configured && (
          <Text style={styles.note}>
            Copy .env.example to .env and fill in your Supabase project values, then restart the
            dev server. Phase 1 (crossing data and schema) needs these.
          </Text>
        )}
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  content: { padding: 20, gap: 20 },
  title: { color: palette.text, fontSize: 32, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: palette.textMuted, fontSize: 14, lineHeight: 20, marginTop: -12 },
  section: {
    backgroundColor: palette.surface,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    padding: 16,
    gap: 10,
  },
  sectionTitle: {
    color: palette.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  rowLabel: { color: palette.textMuted, fontSize: 14, flexShrink: 1 },
  rowValue: { color: palette.text, fontSize: 14, fontWeight: '600', textAlign: 'right' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkMark: { fontSize: 16, fontWeight: '700', width: 18 },
  dot: { width: 16, height: 16, borderRadius: 8 },
  statusText: { flex: 1, gap: 2 },
  statusLabel: { color: palette.text, fontSize: 14, fontWeight: '500' },
  statusValue: { color: palette.textMuted, fontSize: 12, lineHeight: 17 },
  note: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    marginTop: 4,
  },
});
