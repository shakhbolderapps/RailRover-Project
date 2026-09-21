import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  UserLocation,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { PILOT_CENTER, type CrossingStatus, type ReportStatus } from '@railrover/shared';

import { Button } from '@/components/Button';
import { CrossingDetail } from '@/components/CrossingDetail';
import { LocationNotice } from '@/components/LocationNotice';
import { palette, statusColors } from '@/theme/colors';
import { useSession } from '@/stores/session';
import { useLocation } from '@/stores/location';
import { ReportSheet } from '@/components/ReportSheet';
import {
  applyReportedCrossing,
  fetchCrossingsInBounds,
  toFeatureCollection,
  type Bounds,
  type CrossingRow,
} from '@/lib/crossings';

/**
 * OpenFreeMap — MapLibre-compatible vector tiles with no API key and no billing account, which is
 * the whole reason the stack deviates from the SOW's Google Maps (ADR 0001). Attribution required.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/** Close enough to read individual crossings without pulling the whole metro area. */
const INITIAL_ZOOM = 13;

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const status = useSession((s) => s.status);
  const signOut = useSession((s) => s.signOut);

  const permission = useLocation((s) => s.permission);
  const startLocation = useLocation((s) => s.start);
  const stopLocation = useLocation((s) => s.stop);

  const [rows, setRows] = useState<CrossingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Which report the driver is making, if any. `crossing` is set only when they started from a
  // specific crossing's detail view rather than from the map's report buttons.
  const [reporting, setReporting] = useState<{
    status: ReportStatus;
    crossing?: CrossingRow;
  } | null>(null);

  useEffect(() => {
    void startLocation();
    return () => {
      stopLocation();
      if (pending.current) clearTimeout(pending.current);
    };
  }, [startLocation, stopLocation]);

  const loadBounds = useCallback(async (bounds: Bounds) => {
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchCrossingsInBounds(bounds));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not load crossings.');
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Debounced, for two reasons that look like one.
   *
   * Panning emits a steady stream of region changes, and querying on each would be wasteful. Less
   * obviously, the FIRST event on mount reports whole-world bounds (roughly -85° to +85° latitude)
   * before the camera applies its initial state — querying on that pulls the entire inventory on
   * every app open. Waiting for the camera to settle drops both.
   */
  const onRegionDidChange = useCallback(
    (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
      // LngLatBounds is [west, south, east, north] — GeoJSON RFC order, longitude first.
      const [west, south, east, north] = event.nativeEvent.bounds;

      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => {
        void loadBounds({
          minLatitude: south,
          maxLatitude: north,
          minLongitude: west,
          maxLongitude: east,
        });
      }, 250);
    },
    [loadBounds],
  );

  /**
   * SOW M2: "Driver taps a marker to open its detail."
   *
   * A tap on a cluster carries no crossing id — those features are synthetic aggregates — so it
   * is ignored rather than opening a detail sheet for an arbitrary member of the cluster.
   */
  const onCrossingPress = useCallback((event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const id = event.nativeEvent.features[0]?.properties?.id;
    if (typeof id === 'string') setSelectedId(id);
  }, []);

  /**
   * SOW M3 step 5: "System updates the crossing to red across the app."
   *
   * `submit_report` returns the recomputed status, so the marker flips as soon as the report
   * lands instead of waiting for the next viewport reload.
   */
  const onReported = useCallback((updated: CrossingStatus) => {
    setRows((current) => applyReportedCrossing(current, updated));
  }, []);

  const blocked = rows.filter((row) => row.color === 'red').length;
  const collection = toFeatureCollection(rows);
  // Resolved from the current rows rather than stored, so the sheet follows a status change the
  // next time the viewport reloads instead of showing a snapshot from when it was opened.
  const selected = rows.find((row) => row.id === selectedId) ?? null;

  return (
    <View style={styles.screen}>
      <Map style={styles.map} mapStyle={STYLE_URL} onRegionDidChange={onRegionDidChange}>
        {/*
          SOW M2-AC1: the map centres on the driver's live location. `trackUserLocation` follows
          the driver and disengages when they pan, which is what lets someone look ahead along
          their route without the camera dragging them back. The initial state is the Toledo pilot
          centre so the map opens somewhere useful before the first GPS fix lands.
        */}
        <Camera
          initialViewState={{
            center: [PILOT_CENTER.longitude, PILOT_CENTER.latitude],
            zoom: INITIAL_ZOOM,
          }}
          {...(permission === 'granted' ? { trackUserLocation: 'default' as const } : {})}
        />
        {permission === 'granted' ? <UserLocation animated /> : null}

        {/*
          `paint`/`layout` with style-spec (kebab-case) keys, not the legacy camelCase `style`
          prop. `style` is deprecated in v11 and silently renders nothing — it warns to the JS
          console and is removed in v12.
        */}
        <GeoJSONSource
          id="crossings"
          data={collection}
          cluster
          clusterRadius={45}
          clusterMaxZoom={13}
          onPress={onCrossingPress}
        >
          {/*
            Clusters deliberately carry NO status colour. A cluster of fifteen crossings has no
            single status, and averaging or picking one would invent information — a neutral count
            says "zoom in to see these" honestly.
          */}
          <Layer
            id="cluster-circles"
            type="circle"
            filter={['has', 'point_count']}
            paint={{
              'circle-color': palette.surfaceRaised,
              'circle-radius': 16,
              'circle-stroke-width': 2,
              'circle-stroke-color': palette.border,
            }}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
              // OpenMapTiles-based styles ship Noto Sans; the style-spec default font is not in
              // OpenFreeMap's glyph set, and an unavailable font renders no label at all.
              'text-font': ['Noto Sans Regular'],
            }}
            paint={{ 'text-color': palette.text }}
          />

          {/* SOW M2-AC2: red / yellow / green, plus the unknown fourth state. */}
          <Layer
            id="crossing-circles"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={{
              'circle-radius': 7,
              'circle-stroke-width': 2,
              'circle-stroke-color': '#00000066',
              'circle-color': [
                'match',
                ['get', 'color'],
                'red',
                statusColors.red,
                'yellow',
                statusColors.yellow,
                'green',
                statusColors.green,
                statusColors.unknown,
              ],
            }}
          />
        </GeoJSONSource>
      </Map>

      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.summary}>
          <Text style={styles.summaryText}>
            {loading
              ? 'Loading crossings…'
              : `${rows.length} crossing${rows.length === 1 ? '' : 's'} here` +
                (blocked > 0 ? ` · ${blocked} blocked` : '')}
          </Text>
          {loading ? <ActivityIndicator size="small" color={palette.textMuted} /> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <LocationNotice permission={permission} onRequest={() => void startLocation()} />
      </View>

      {reporting ? (
        <View style={styles.sheetWrap}>
          <ReportSheet
            status={reporting.status}
            {...(reporting.crossing ? { crossing: reporting.crossing } : {})}
            onClose={() => setReporting(null)}
            onReported={onReported}
          />
        </View>
      ) : selected ? (
        <View style={styles.sheetWrap}>
          <CrossingDetail
            crossing={selected}
            onClose={() => setSelectedId(null)}
            onReport={(reportStatus) => setReporting({ status: reportStatus, crossing: selected })}
          />
        </View>
      ) : (
        <View
          style={[styles.bottom, { paddingBottom: insets.bottom + 12 }]}
          pointerEvents="box-none"
        >
          <Text style={styles.attribution}>© OpenFreeMap · OpenMapTiles · OpenStreetMap</Text>

          {/*
            SOW M3-AC1: two taps, under five seconds. This is tap one — deliberately the largest
            target on the screen, because it is pressed one-handed at a level crossing.
          */}
          <View style={styles.actions}>
            <Button
              label="Blocked"
              onPress={() => setReporting({ status: 'blocked' })}
              style={StyleSheet.flatten([styles.action, { backgroundColor: statusColors.red }])}
            />
            <Button
              label="Clear"
              onPress={() => setReporting({ status: 'clear' })}
              style={StyleSheet.flatten([styles.action, { backgroundColor: statusColors.green }])}
            />
          </View>

          {status === 'guest' ? (
            <Button
              label="Create an account"
              variant="ghost"
              onPress={() => router.push('/sign-up')}
            />
          ) : (
            <Button
              label="Sign out"
              variant="ghost"
              onPress={() => {
                void signOut().then(() => router.replace('/'));
              }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.background },
  map: { flex: 1 },
  top: { position: 'absolute', top: 0, left: 0, right: 0, padding: 12, gap: 8 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: palette.surface,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: palette.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  summaryText: { color: palette.text, fontSize: 14, fontWeight: '500' },
  error: { color: statusColors.red, fontSize: 13, paddingHorizontal: 4 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, gap: 8 },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, minHeight: 64 },
  attribution: { color: palette.textMuted, fontSize: 10, textAlign: 'center' },
});
