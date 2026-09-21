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
import { useLocation } from '@/stores/location';
import { ActiveAlerts } from '@/components/ActiveAlerts';
import { ConflictAlert } from '@/components/ConflictAlert';
import { buildActiveAlerts } from '@/lib/active-alerts';
import { DestinationSearch } from '@/components/DestinationSearch';
import { selectActiveConflict, useConflicts } from '@/stores/conflicts';
import { logAlertShown, logReroute } from '@/lib/conflicts';
import { useSession } from '@/stores/session';
import { computeReroute } from '@/lib/reroute';
import { ReportSheet } from '@/components/ReportSheet';
import { RouteOptions } from '@/components/RouteOptions';
import { selectActiveRoute, useRoute } from '@/stores/route';
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
  const deviceId = useSession((s) => s.deviceId);

  const permission = useLocation((s) => s.permission);
  const fix = useLocation((s) => s.fix);
  const startLocation = useLocation((s) => s.start);
  const stopLocation = useLocation((s) => s.stop);

  const destination = useRoute((s) => s.destination);
  const routeOptions = useRoute((s) => s.options);
  const routeSelectedId = useRoute((s) => s.selectedId);
  const routeLoading = useRoute((s) => s.loading);
  const routeError = useRoute((s) => s.error);
  const planTo = useRoute((s) => s.planTo);
  const selectRoute = useRoute((s) => s.select);
  const clearRoute = useRoute((s) => s.clear);
  const replaceActiveRoute = useRoute((s) => s.replaceActive);
  const activeRoute = useRoute(selectActiveRoute);

  const [showRoutes, setShowRoutes] = useState(false);

  const conflicts = useConflicts((s) => s.conflicts);
  const activeConflict = useConflicts(selectActiveConflict);
  const startConflictWatch = useConflicts((s) => s.start);
  const updateConflictPosition = useConflicts((s) => s.updatePosition);
  const dismissConflict = useConflicts((s) => s.dismiss);
  const stopConflictWatch = useConflicts((s) => s.stop);

  const [showAlerts, setShowAlerts] = useState(false);
  const [rerouting, setRerouting] = useState(false);
  const [rerouteMessage, setRerouteMessage] = useState<string | null>(null);

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

  /**
   * SOW M4: the route check runs continuously while a route is active, not once at departure.
   * Keyed to the route's identity so choosing a different option restarts the watch against the
   * new line — and NOT keyed to `fix`, because restarting on every GPS update would tear down and
   * rebuild the Realtime subscription several times a minute. Position is fed in separately below.
   */
  useEffect(() => {
    if (!activeRoute || !fix) {
      stopConflictWatch();
      return;
    }
    startConflictWatch(activeRoute.coordinates, fix);
    return () => stopConflictWatch();
    // `fix` and `activeRoute` are deliberately excluded. Position is fed in through
    // updatePosition below; including it here would restart the watch on every GPS update,
    // tearing down and rebuilding the Realtime subscription several times a minute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRoute?.id, startConflictWatch, stopConflictWatch]);

  useEffect(() => {
    if (fix) updateConflictPosition(fix);
  }, [fix, updateConflictPosition]);

  /**
   * Log each alert ONCE, the first time it is shown (SOW M5 analytics).
   *
   * Keyed on the crossing id rather than on render, because the conflict list is refreshed every
   * time the driver moves 100 m — logging on render would turn one warning into dozens of events
   * and make "alerts shown" meaningless.
   */
  const loggedAlerts = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeConflict || !deviceId) return;
    if (loggedAlerts.current.has(activeConflict.crossing_id)) return;
    loggedAlerts.current.add(activeConflict.crossing_id);
    void logAlertShown(activeConflict.crossing_id, deviceId, activeConflict.meters_ahead);
  }, [activeConflict, deviceId]);

  const onReroute = useCallback(async () => {
    if (!activeConflict || !fix || !destination) return;
    setRerouting(true);
    setRerouteMessage(null);

    const outcome = await computeReroute(
      fix,
      { latitude: destination.latitude, longitude: destination.longitude },
      activeConflict,
    );
    setRerouting(false);

    if (deviceId) void logReroute(activeConflict.crossing_id, deviceId, outcome.kind === 'rerouted' ? 'rerouted' : 'no_better_route');

    if (outcome.kind === 'rerouted') {
      replaceActiveRoute(outcome);
      dismissConflict(activeConflict.crossing_id);
      return;
    }

    // Keep the current route and say so plainly. A driver told "no better route" can still decide
    // to wait or detour themselves, which is more use than a spinner that never resolves.
    setRerouteMessage(
      outcome.kind === 'no_better_route'
        ? 'No clear way around this one — every alternate still passes a blocked crossing. Keeping your route.'
        : outcome.message,
    );
  }, [activeConflict, fix, destination, replaceActiveRoute, dismissConflict, deviceId]);

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
  const activeAlerts = buildActiveAlerts(conflicts, rows);
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
          Route options drawn beneath the crossings, so the markers a driver is choosing between
          stay on top of the lines that connect them (SOW M4-AC1).
        */}
        {routeOptions.length > 0 ? (
          <GeoJSONSource
            id="routes"
            data={{
              type: 'FeatureCollection',
              features: routeOptions.map((option) => ({
                type: 'Feature' as const,
                id: option.id,
                geometry: { type: 'LineString' as const, coordinates: option.coordinates },
                properties: { id: option.id, selected: option.id === routeSelectedId },
              })),
            }}
          >
            <Layer
              id="route-lines"
              type="line"
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{
                'line-color': ['case', ['get', 'selected'], palette.accent, palette.textMuted],
                'line-width': ['case', ['get', 'selected'], 6, 3],
                'line-opacity': ['case', ['get', 'selected'], 0.95, 0.45],
              }}
            />
          </GeoJSONSource>
        ) : null}

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
        {/* SOW M2-AC3: destination search at the top. */}
        <DestinationSearch
          near={fix}
          selected={destination}
          onClear={clearRoute}
          onSelect={(place) => {
            if (!fix) return;
            setShowRoutes(true);
            void planTo(place, fix);
          }}
        />

        <View style={styles.summary}>
          {/*
            SOW M2-AC4: with a route active, the summary is about the ROUTE, not the viewport —
            "1 blocked crossing on your route" is what a driver about to set off needs, and a
            count of whatever happens to be on screen is not.
          */}
          <Text style={styles.summaryText}>
            {loading
              ? 'Loading crossings…'
              : activeRoute
                ? `${activeRoute.blockedCrossings} blocked crossing${
                    activeRoute.blockedCrossings === 1 ? '' : 's'
                  } on your route · ${activeRoute.totalCrossings} total`
                : `${rows.length} crossing${rows.length === 1 ? '' : 's'} here` +
                  (blocked > 0 ? ` · ${blocked} blocked` : '')}
          </Text>
          {loading ? <ActivityIndicator size="small" color={palette.textMuted} /> : null}
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <LocationNotice permission={permission} onRequest={() => void startLocation()} />
      </View>

      {/*
        The alert outranks everything else on screen. A driver browsing route options while a
        fresh blocked crossing sits ahead of them needs to be told, and burying that under a sheet
        they happen to have open would be the one genuinely unsafe UI decision available here.
      */}
      {activeConflict ? (
        <View style={styles.sheetWrap}>
          <ConflictAlert
            conflict={activeConflict}
            totalAhead={conflicts.length}
            rerouting={rerouting}
            rerouteMessage={rerouteMessage}
            onReroute={() => void onReroute()}
            onKeepRoute={() => {
              setRerouteMessage(null);
              if (deviceId) void logReroute(activeConflict.crossing_id, deviceId, 'declined');
              dismissConflict(activeConflict.crossing_id);
            }}
          />
        </View>
      ) : showAlerts ? (
        <View style={styles.sheetWrap}>
          <ActiveAlerts
            alerts={activeAlerts}
            onClose={() => setShowAlerts(false)}
            onSelect={(crossingId) => {
              // SOW M4 Active-Alerts AC3: tapping opens the crossing's detail. Only crossings the
              // map has loaded have a detail row to show; an on-route conflict far outside the
              // viewport has none, so the list stays open rather than opening an empty sheet.
              if (rows.some((row) => row.id === crossingId)) {
                setShowAlerts(false);
                setSelectedId(crossingId);
              }
            }}
          />
        </View>
      ) : reporting ? (
        <View style={styles.sheetWrap}>
          <ReportSheet
            status={reporting.status}
            {...(reporting.crossing ? { crossing: reporting.crossing } : {})}
            onClose={() => setReporting(null)}
            onReported={onReported}
          />
        </View>
      ) : showRoutes ? (
        <View style={styles.sheetWrap}>
          <RouteOptions
            options={routeOptions}
            selectedId={routeSelectedId}
            loading={routeLoading}
            error={routeError}
            onSelect={selectRoute}
            onClose={() => setShowRoutes(false)}
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

          {activeAlerts.length > 0 ? (
            <Button
              label={`Active alerts (${activeAlerts.length})`}
              variant="secondary"
              onPress={() => setShowAlerts(true)}
            />
          ) : null}

          {activeRoute ? (
            <Button
              label="Route options"
              variant="secondary"
              onPress={() => setShowRoutes(true)}
            />
          ) : null}

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

          <View style={styles.links}>
            <Button
              label="Notifications"
              variant="ghost"
              onPress={() => router.push('/inbox')}
              style={styles.link}
            />
            <Button
              label="Settings"
              variant="ghost"
              onPress={() => router.push('/settings')}
              style={styles.link}
            />
          </View>
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
  links: { flexDirection: 'row', gap: 8 },
  link: { flex: 1 },
  action: { flex: 1, minHeight: 64 },
  attribution: { color: palette.textMuted, fontSize: 10, textAlign: 'center' },
});
