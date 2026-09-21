import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import {
  addCrossing,
  searchCrossings,
  setCrossingActive,
  updateCrossing,
  type AdminCrossing,
} from './lib/crossings';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Crossing inventory management (SOW M5).
 *
 * The map is the point of this screen. Correcting a crossing by typing coordinates is possible and
 * useless — an operator fixing a misplaced marker is looking at where it should be, not at a pair
 * of decimals — so the marker is draggable and the coordinates follow it.
 */
export function CrossingEditor({ onNotice }: { onNotice: (message: string) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AdminCrossing[]>([]);
  const [selected, setSelected] = useState<AdminCrossing | null>(null);
  const [draft, setDraft] = useState<{ latitude: number; longitude: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const container = useRef<HTMLDivElement | null>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const marker = useRef<maplibregl.Marker | null>(null);

  const search = async () => {
    try {
      setResults(await searchCrossings(query));
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'Search failed.');
    }
  };

  useEffect(() => {
    void search();

  }, []);

  // Build the map once the editor has a crossing to show; tearing it down and rebuilding on every
  // selection would lose the operator's zoom level between edits.
  useEffect(() => {
    if (!selected || !container.current) return;

    if (!map.current) {
      map.current = new maplibregl.Map({
        container: container.current,
        style: STYLE_URL,
        center: [selected.longitude, selected.latitude],
        zoom: 16,
      });
    } else {
      map.current.setCenter([selected.longitude, selected.latitude]);
    }

    marker.current?.remove();
    marker.current = new maplibregl.Marker({ draggable: true, color: '#d7262f' })
      .setLngLat([selected.longitude, selected.latitude])
      .addTo(map.current);

    marker.current.on('dragend', () => {
      const position = marker.current?.getLngLat();
      if (position) setDraft({ latitude: position.lat, longitude: position.lng });
    });

    setDraft({ latitude: selected.latitude, longitude: selected.longitude });
  }, [selected]);

  const save = async () => {
    if (!selected || !draft) return;
    setBusy(true);
    try {
      await updateCrossing(selected.id, {
        name: selected.name,
        road: selected.road,
        city: selected.city,
        latitude: draft.latitude,
        longitude: draft.longitude,
      });
      onNotice('Crossing updated. The map and the route logic use it immediately.');
      await search();
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const retire = async (crossing: AdminCrossing) => {
    setBusy(true);
    try {
      await setCrossingActive(crossing.id, !crossing.is_active);
      onNotice(
        crossing.is_active
          ? 'Crossing retired. Its report history is kept.'
          : 'Crossing restored.',
      );
      await search();
      setSelected(null);
    } catch (cause) {
      onNotice(cause instanceof Error ? cause.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <h2>Crossing inventory</h2>

      <div className="row">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void search();
          }}
          placeholder="Search by name, road, city or FRA id"
          style={{ flex: 1, minWidth: 220 }}
        />
        <button onClick={() => void search()}>Search</button>
      </div>

      <table style={{ marginTop: 14 }}>
        <thead>
          <tr>
            <th>Crossing</th>
            <th>City</th>
            <th>FRA id</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {results.map((crossing) => (
            <tr key={crossing.id} className={crossing.is_active ? undefined : 'removed'}>
              <td>{crossing.name ?? crossing.road ?? '—'}</td>
              <td>{crossing.city ?? '—'}</td>
              <td className="mono">{crossing.dot_id}</td>
              <td>
                <span className={`dot ${crossing.color}`} />
                {crossing.is_active ? crossing.color : 'retired'}
              </td>
              <td className="row">
                <button onClick={() => setSelected(crossing)}>Edit position</button>
                <button disabled={busy} onClick={() => void retire(crossing)}>
                  {crossing.is_active ? 'Retire' : 'Restore'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selected ? (
        <div style={{ marginTop: 18 }}>
          <h2>{selected.name ?? selected.dot_id}</h2>
          <p className="muted">
            Drag the marker to correct the position, then save. The change reaches the driver map,
            nearest-crossing selection and the route conflict logic at once — every one of them
            reads this same row.
          </p>
          <div ref={container} style={{ height: 340, borderRadius: 10, overflow: 'hidden' }} />
          <div className="row" style={{ marginTop: 12 }}>
            <span className="mono">
              {draft ? `${draft.latitude.toFixed(6)}, ${draft.longitude.toFixed(6)}` : ''}
            </span>
            <button type="submit" disabled={busy} onClick={() => void save()}>
              {busy ? 'Saving…' : 'Save position'}
            </button>
            <button onClick={() => setSelected(null)}>Close</button>
          </div>
        </div>
      ) : null}

      <AddCrossing
        onAdded={async (message) => {
          onNotice(message);
          await search();
        }}
      />
    </section>
  );
}

function AddCrossing({ onAdded }: { onAdded: (message: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    dot_id: '',
    name: '',
    road: '',
    city: 'Toledo',
    state: 'Ohio',
    latitude: '',
    longitude: '',
  });
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await addCrossing({
        ...form,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
      });
      setForm({ ...form, dot_id: '', name: '', road: '', latitude: '', longitude: '' });
      setOpen(false);
      await onAdded('Crossing added.');
    } catch (cause) {
      await onAdded(cause instanceof Error ? cause.message : 'Could not add the crossing.');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button style={{ marginTop: 16 }} onClick={() => setOpen(true)}>
        Add a crossing
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="stack" style={{ marginTop: 16 }}>
      <p className="muted">
        The database will refuse a grade-separated crossing — an overpass can never be blocked by a
        train, and the CHECK constraint enforces that no matter how it is entered.
      </p>
      {(['dot_id', 'name', 'road', 'city', 'state', 'latitude', 'longitude'] as const).map(
        (field) => (
          <label key={field}>
            {field.replace('_', ' ')}
            <input
              value={form[field]}
              onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              required
            />
          </label>
        ),
      )}
      <div className="row">
        <button type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add crossing'}
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}
