import { RouteSimulator, type SimulatedCrossing } from './route-simulator';
import { __setConflictSource, selectActiveConflict, useConflicts } from './conflicts';

/**
 * The scenarios the roadmap requires this simulator to prove (Phase 6 QA gate):
 *
 *   - the alert fires once, not on a loop
 *   - it fires for a report injected mid-trip
 *   - it does not fire for a crossing off-route
 *   - it does not fire for a crossing behind the driver
 *   - it clears on a clear report
 *
 * Each is a behaviour over TIME. pgTAP proves conflicts_ahead answers a single question
 * correctly; these prove the store reacts correctly as the answer changes underneath it.
 */

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

async function runTrip(crossings: SimulatedCrossing[], steps: number) {
  const simulator = new RouteSimulator({ crossings, metersPerStep: 400 });
  __setConflictSource(simulator.asConflictSource());

  const store = useConflicts.getState();
  store.start(simulator.routeLine(), simulator.driverPosition());
  await settle();

  /** The alert the driver would see after each step — null when no alert is showing. */
  const shown: (string | null)[] = [selectActiveConflict(useConflicts.getState())?.name ?? null];

  for (let i = 0; i < steps; i++) {
    const position = simulator.advance();
    useConflicts.getState().updatePosition(position);
    simulator.injectReport(); // a report changefeed tick, as Realtime would deliver
    await settle();
    shown.push(selectActiveConflict(useConflicts.getState())?.name ?? null);
  }

  return { simulator, shown };
}

afterEach(() => {
  useConflicts.getState().stop();
});

describe('route simulator', () => {
  it('M4-AC2: alerts for a blocked crossing far ahead, long before the driver reaches it', async () => {
    // 8 km ahead on a trip that advances 400 m per step: the driver is nowhere near it, and that
    // is precisely when the warning is useful.
    const { shown } = await runTrip(
      [{ id: 'far', name: 'Far Crossing', metersAlongRoute: 8_000, blockedAtStep: 0 }],
      3,
    );
    expect(shown.every((name) => name === 'Far Crossing')).toBe(true);
  });

  it('M4-AC1 edge case: never alerts for a crossing outside the corridor', async () => {
    const { shown } = await runTrip(
      [
        {
          id: 'off',
          name: 'Off Route',
          metersAlongRoute: 2_000,
          metersOffRoute: 300, // well outside the ~61 m corridor
          blockedAtStep: 0,
        },
      ],
      4,
    );
    expect(shown.every((name) => name === null)).toBe(true);
  });

  it('M4-AC3: stops alerting once the driver has passed the crossing', async () => {
    // 800 m ahead at 400 m per step: passed after step 2.
    const { shown } = await runTrip(
      [{ id: 'near', name: 'Near Crossing', metersAlongRoute: 800, blockedAtStep: 0 }],
      4,
    );
    expect(shown[0]).toBe('Near Crossing');
    expect(shown[1]).toBe('Near Crossing');
    expect(shown[shown.length - 1]).toBeNull();
  });

  it('M4-AC5: notices a report submitted mid-trip, not only what was known at departure', async () => {
    const { shown } = await runTrip(
      [{ id: 'later', name: 'Reported Later', metersAlongRoute: 6_000, blockedAtStep: 3 }],
      5,
    );
    // Silent while nobody has reported it...
    expect(shown.slice(0, 3).every((name) => name === null)).toBe(true);
    // ...and alerting once someone does, without the trip restarting.
    expect(shown[shown.length - 1]).toBe('Reported Later');
  });

  it('clears the alert when the crossing is reported clear', async () => {
    const { shown } = await runTrip(
      [
        {
          id: 'cleared',
          name: 'Cleared Crossing',
          metersAlongRoute: 9_000,
          blockedAtStep: 0,
          clearedAtStep: 3,
        },
      ],
      5,
    );
    expect(shown[0]).toBe('Cleared Crossing');
    expect(shown[shown.length - 1]).toBeNull();
  });

  it('surfaces the NEAREST conflict when several are ahead', async () => {
    const { shown } = await runTrip(
      [
        { id: 'far', name: 'Far', metersAlongRoute: 9_000, blockedAtStep: 0 },
        { id: 'near', name: 'Near', metersAlongRoute: 2_000, blockedAtStep: 0 },
      ],
      1,
    );
    // The rest belong in the Active Alerts list, not in a stack of competing alerts.
    expect(shown[0]).toBe('Near');
    expect(useConflicts.getState().conflicts).toHaveLength(2);
  });

  it('does not re-raise an alert the driver dismissed, while it stays ahead of them', async () => {
    // "Fires once, not on a loop": the re-check keeps returning the conflict every step, and the
    // driver who chose "keep my route" must not be asked again at every GPS update.
    const simulator = new RouteSimulator({
      crossings: [{ id: 'kept', name: 'Kept Route', metersAlongRoute: 9_000, blockedAtStep: 0 }],
      metersPerStep: 400,
    });
    __setConflictSource(simulator.asConflictSource());

    useConflicts.getState().start(simulator.routeLine(), simulator.driverPosition());
    await settle();
    expect(selectActiveConflict(useConflicts.getState())?.name).toBe('Kept Route');

    useConflicts.getState().dismiss('kept');

    for (let i = 0; i < 4; i++) {
      useConflicts.getState().updatePosition(simulator.advance());
      simulator.injectReport();
      await settle();
      expect(selectActiveConflict(useConflicts.getState())).toBeNull();
    }

    // Still genuinely a conflict — dismissed is a UI decision, not a change to the facts, which
    // is what lets the Active Alerts list keep showing it.
    expect(useConflicts.getState().conflicts).toHaveLength(1);
  });

  it('keeps the last known conflicts when a check fails, rather than going quiet', async () => {
    // Silently clearing an alert because the network blipped is the dangerous failure here: the
    // crossing is still blocked, and the driver would have no idea.
    const simulator = new RouteSimulator({
      crossings: [{ id: 'x', name: 'Still Blocked', metersAlongRoute: 9_000, blockedAtStep: 0 }],
      metersPerStep: 400,
    });
    const source = simulator.asConflictSource();
    __setConflictSource(source);

    useConflicts.getState().start(simulator.routeLine(), simulator.driverPosition());
    await settle();
    expect(useConflicts.getState().conflicts).toHaveLength(1);

    __setConflictSource({
      ...source,
      fetch: async () => {
        throw new Error('offline');
      },
    });
    useConflicts.getState().updatePosition(simulator.advance());
    await settle();

    expect(selectActiveConflict(useConflicts.getState())?.name).toBe('Still Blocked');
  });
});
