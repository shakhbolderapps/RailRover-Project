import { useCallback, useEffect, useState } from 'react';

import { getSupabase, isConfigured } from './lib/supabase';
import {
  broadcast,
  fetchMetrics,
  fetchMostBlocked,
  fetchRecentReports,
  isAdmin,
  removeReport,
  setDeviceSuspended,
  TIME_WINDOWS,
  windowStart,
  type BlockedCrossing,
  type PilotMetrics,
  type ReportRow,
} from './lib/admin';

type Gate = 'loading' | 'signed-out' | 'not-admin' | 'admin';

/**
 * RailRover web admin panel (SOW M5).
 *
 * The sign-in gate here is a convenience, not a control. Every administrative action re-checks
 * `is_admin()` server-side inside a SECURITY DEFINER function, and the pgTAP suite asserts each
 * one refuses a driver — so a non-admin who bypassed this screen entirely would still be unable
 * to remove a report, suspend a device, broadcast, or read the pilot metrics.
 */
export function App() {
  const [gate, setGate] = useState<Gate>('loading');

  const check = useCallback(async () => {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) return setGate('signed-out');
    setGate((await isAdmin()) ? 'admin' : 'not-admin');
  }, []);

  useEffect(() => {
    if (!isConfigured()) return;
    void check();
    const { data } = getSupabase().auth.onAuthStateChange(() => void check());
    return () => data.subscription.unsubscribe();
  }, [check]);

  if (!isConfigured()) {
    return (
      <Shell>
        <h1>Configuration needed</h1>
        <p className="muted">
          Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in apps/admin/.env, then restart the dev
          server.
        </p>
      </Shell>
    );
  }

  if (gate === 'loading') return <Shell><p className="muted">Checking your access…</p></Shell>;
  if (gate === 'signed-out') return <SignIn />;
  if (gate === 'not-admin') return <NotAdmin />;
  return <Panel />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="shell">{children}</div>;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: authError } = await getSupabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    // Same deliberately ambiguous wording as the mobile app: saying which half was wrong turns
    // this form into an account-existence oracle.
    if (authError) setError('Email or password is incorrect.');
  };

  return (
    <Shell>
      <h1>RailRover admin</h1>
      <form onSubmit={submit} className="stack">
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            required
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Shell>
  );
}

function NotAdmin() {
  return (
    <Shell>
      <h1>No admin access</h1>
      <p className="muted">
        This account is signed in but does not have the administrator role. Ask an existing
        administrator to grant it.
      </p>
      <button onClick={() => void getSupabase().auth.signOut()}>Sign out</button>
    </Shell>
  );
}

function Panel() {
  const [hours, setHours] = useState<number>(TIME_WINDOWS[0].hours);
  const [metrics, setMetrics] = useState<PilotMetrics | null>(null);
  const [blocked, setBlocked] = useState<BlockedCrossing[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    const since = windowStart(hours);
    const [m, b, r] = await Promise.all([
      fetchMetrics(since),
      fetchMostBlocked(since),
      fetchRecentReports(),
    ]);
    setMetrics(m);
    setBlocked(b);
    setReports(r);
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    try {
      await action();
      setNotice(message);
      await load();
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel">
      <header>
        <h1>RailRover admin</h1>
        <div className="row">
          <select value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {TIME_WINDOWS.map((w) => (
              <option key={w.hours} value={w.hours}>
                Last {w.label}
              </option>
            ))}
          </select>
          <button onClick={() => void getSupabase().auth.signOut()}>Sign out</button>
        </div>
      </header>

      {notice ? <p className="notice">{notice}</p> : null}

      <section>
        <h2>Pilot metrics</h2>
        <div className="metrics">
          <Metric label="Blocked right now" value={metrics?.active_reports} />
          <Metric label="Reports in window" value={metrics?.total_reports} />
          <Metric label="Alerts shown" value={metrics?.alerts_shown} />
          <Metric label="Reroutes taken" value={metrics?.reroutes_taken} />
          {/*
            Offered vs taken is the question a pilot is meant to answer: a feature that fires often
            and is never accepted is not working, and one number alone cannot show that.
          */}
          <Metric label="Reroutes offered" value={metrics?.reroutes_offered} />
        </div>
      </section>

      <section>
        <h2>Most-affected crossings</h2>
        {blocked.length === 0 ? (
          <p className="muted">No blocked reports in this window.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Crossing</th>
                <th>City</th>
                <th>Blocked reports</th>
                <th>Now</th>
              </tr>
            </thead>
            <tbody>
              {blocked.map((crossing) => (
                <tr key={crossing.crossing_id}>
                  <td>{crossing.name ?? crossing.road ?? crossing.dot_id}</td>
                  <td>{crossing.city ?? '—'}</td>
                  <td>{crossing.blocked_count}</td>
                  <td>
                    <span className={`dot ${crossing.current_color}`} /> {crossing.current_color}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Recent reports</h2>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Status</th>
              <th>Device</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {reports.map((report) => (
              <tr key={report.id} className={report.is_removed ? 'removed' : undefined}>
                <td>{new Date(report.reported_at).toLocaleString()}</td>
                <td>{report.status}</td>
                <td className="mono">{report.device_id}</td>
                <td className="row">
                  {report.is_removed ? (
                    <span className="muted">removed</span>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(() => removeReport(report.id), 'Report removed. The crossing recomputed.')
                      }
                    >
                      Remove
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() =>
                      void act(
                        () => setDeviceSuspended(report.device_id, true),
                        'Device suspended. Its future reports will be refused.',
                      )
                    }
                  >
                    Suspend device
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <Broadcast onSent={(message) => setNotice(message)} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="metric">
      <span className="metricValue">{value ?? '—'}</span>
      <span className="metricLabel">{label}</span>
    </div>
  );
}

function Broadcast({ onSent }: { onSent: (message: string) => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await broadcast(title, body);
      setTitle('');
      setBody('');
      onSent('Broadcast sent to every driver.');
    } catch (cause) {
      onSent(cause instanceof Error ? cause.message : 'Broadcast failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Broadcast to all drivers</h2>
      <form onSubmit={send} className="stack">
        <label>
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} required />
        </label>
        <label>
          Message
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required />
        </label>
        <button type="submit" disabled={busy || title.length === 0}>
          {busy ? 'Sending…' : 'Send to everyone'}
        </button>
      </form>
    </section>
  );
}
