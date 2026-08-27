import {
  DEFAULT_APP_CONFIG,
  DEFAULT_ROUTE_CORRIDOR_FEET,
  computeCrossingColor,
  describeColor,
  type CrossingColor,
} from '@railrover/shared';

/**
 * Phase 0 shell for the Web Admin Panel (SOW M5).
 *
 * Exists to prove the workspace wiring: the same platform-free `packages/shared` that the mobile
 * app uses resolves here too, so crossing-status rules cannot diverge between the driver app and
 * the back office. The real panel — admin auth, crossing inventory management, report review,
 * broadcasts, pilot analytics — is Phase 8/9.
 */
const statusColors: Record<CrossingColor, string> = {
  red: '#D7262F',
  yellow: '#E8A317',
  green: '#1F9D55',
  unknown: '#8A94A6',
};

const now = new Date();
const samples = [
  { label: 'Fresh blocked report (2 min ago)', minutesAgo: 2, status: 'blocked' as const },
  { label: 'Blocked, aged out (20 min ago)', minutesAgo: 20, status: 'blocked' as const },
  { label: 'Clear report', minutesAgo: 5, status: 'clear' as const },
  { label: 'No reports yet', minutesAgo: null, status: null },
];

export function App() {
  return (
    <main>
      <header>
        <h1>RailRover Admin</h1>
        <p>Phase 0 — workspace shell. Module 5 tooling lands in Phase 8.</p>
      </header>

      <section>
        <h2>Crossing status vocabulary</h2>
        <p className="muted">
          Computed by the shared package, mirrored by the <code>crossing_status</code> SQL view.
          Never stored as a column.
        </p>
        <ul className="statuses">
          {samples.map((sample) => {
            const color = computeCrossingColor({
              lastStatus: sample.status,
              lastReportedAt:
                sample.minutesAgo === null
                  ? null
                  : new Date(now.getTime() - sample.minutesAgo * 60_000),
              now,
              freshnessWindowMinutes: DEFAULT_APP_CONFIG.freshnessWindowMinutes,
            });
            return (
              <li key={sample.label}>
                <span className="dot" style={{ background: statusColors[color] }} />
                <span>{sample.label}</span>
                <strong>
                  {color} — {describeColor(color)}
                </strong>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Operational defaults</h2>
        <dl>
          <dt>Freshness window</dt>
          <dd>{DEFAULT_APP_CONFIG.freshnessWindowMinutes} min</dd>
          <dt>Route corridor width</dt>
          <dd>
            {DEFAULT_ROUTE_CORRIDOR_FEET} ft ({DEFAULT_APP_CONFIG.routeCorridorMeters.toFixed(2)} m)
          </dd>
          <dt>Report radius</dt>
          <dd>1 mi ({DEFAULT_APP_CONFIG.reportRadiusMeters.toFixed(0)} m)</dd>
        </dl>
        <p className="muted">
          Tunable at runtime from the <code>app_config</code> table — the SOW ships these as
          defaults and tunes them during the pilot.
        </p>
      </section>
    </main>
  );
}
