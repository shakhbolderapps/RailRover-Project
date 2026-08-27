#!/usr/bin/env tsx
/**
 * Ingest the FRA crossing inventory into the `crossings` table.
 *
 * Idempotent: upserts on `dot_id`, so re-running is safe and expanding the radius is purely
 * additive. See decisions/0008-pilot-radius-staged-ingest.md for why the default is 50 miles
 * rather than the SOW's 200.
 *
 * Usage:
 *   pnpm --filter @railrover/scripts ingest -- --dry-run
 *   pnpm --filter @railrover/scripts ingest -- --radius 50
 *   pnpm --filter @railrover/scripts ingest -- --radius 200 --yes
 */
import { createClient } from '@supabase/supabase-js';
import { PILOT_CENTER, PILOT_RADIUS_MILES_DEV } from '@railrover/shared';
import {
  FILTERS,
  buildWhere,
  count,
  fetchAll,
  toCrossingRow,
  type CrossingRow,
  type FraRecord,
} from './fra';

interface Options {
  radiusMiles: number;
  latitude: number;
  longitude: number;
  dryRun: boolean;
  confirmed: boolean;
  batchSize: number;
}

function parseArgs(argv: string[]): Options {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    radiusMiles: Number(get('--radius') ?? PILOT_RADIUS_MILES_DEV),
    latitude: Number(get('--lat') ?? PILOT_CENTER.latitude),
    longitude: Number(get('--lng') ?? PILOT_CENTER.longitude),
    dryRun: argv.includes('--dry-run'),
    confirmed: argv.includes('--yes'),
    batchSize: Number(get('--batch') ?? 500),
  };
}

const n = (value: number) => value.toLocaleString('en-US');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const query = {
    latitude: options.latitude,
    longitude: options.longitude,
    radiusMiles: options.radiusMiles,
  };

  console.log('');
  console.log('FRA Crossing Inventory ingest');
  console.log('─'.repeat(78));
  console.log(`  centre    ${query.latitude}, ${query.longitude}  (Toledo, Ohio — SOW §8)`);
  console.log(`  radius    ${query.radiusMiles} miles`);
  console.log(`  mode      ${options.dryRun ? 'DRY RUN — nothing is written' : 'WRITE'}`);
  console.log('');

  // -------------------------------------------------------------------------------------------
  // Filter-stage report. This is the part worth reading: it shows exactly how much of the raw
  // inventory is unusable and why, rather than silently discarding 60% of it.
  // -------------------------------------------------------------------------------------------
  const appToken = process.env.SOCRATA_APP_TOKEN;
  console.log('  Filter stages');
  console.log('  ' + '─'.repeat(76));

  let previous = await count(buildWhere(query, 0), appToken);
  console.log(`    ${'raw records in radius'.padEnd(26)} ${n(previous).padStart(8)}`);

  for (let i = 0; i < FILTERS.length; i++) {
    const filter = FILTERS[i]!;
    const remaining = await count(buildWhere(query, i + 1), appToken);
    const removed = previous - remaining;
    console.log(
      `    ${('+ ' + filter.key).padEnd(26)} ${n(remaining).padStart(8)}` +
        (removed > 0 ? `   −${n(removed)}` : ''),
    );
    previous = remaining;
  }

  const expected = previous;
  const rawTotal = await count(buildWhere(query, 0), appToken);
  const dropped = rawTotal - expected;
  console.log('  ' + '─'.repeat(76));
  console.log(
    `    ${'usable crossings'.padEnd(26)} ${n(expected).padStart(8)}   ` +
      `(${Math.round((dropped / rawTotal) * 100)}% of raw dropped)`,
  );
  console.log('');

  if (options.dryRun) {
    console.log('  Why each filter exists');
    console.log('  ' + '─'.repeat(76));
    for (const filter of FILTERS) {
      console.log(`    ${filter.key}`);
      for (const line of wrap(filter.reason, 70)) console.log(`      ${line}`);
      console.log('');
    }
    console.log('  Dry run complete — nothing was written.');
    console.log('  Re-run without --dry-run to load these into the crossings table.');
    console.log('');
    return;
  }

  // -------------------------------------------------------------------------------------------
  // Write path
  // -------------------------------------------------------------------------------------------
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('✗ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to write.');
    console.error('  The service-role key is required because RLS restricts crossings writes to');
    console.error('  administrators. Keep it in your shell or .env — NEVER in the mobile app.');
    console.error('');
    console.error('  To preview without credentials:  pnpm ingest -- --dry-run');
    process.exit(1);
  }

  if (options.radiusMiles > 100 && !options.confirmed) {
    console.error(`✗ A ${options.radiusMiles}-mile radius loads ~${n(expected)} crossings.`);
    console.error('  Development runs against 50 miles for fast cycles (ADR 0008).');
    console.error('  Re-run with --yes if you intend the full pilot radius.');
    process.exit(1);
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  let fetched = 0;
  let upserted = 0;
  const skipped = new Map<string, number>();
  let batch: CrossingRow[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const { error } = await supabase
      .from('crossings')
      .upsert(batch as unknown as Record<string, unknown>[], {
        onConflict: 'dot_id',
        ignoreDuplicates: false,
      });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
    upserted += batch.length;
    process.stdout.write(`\r  upserted ${n(upserted)} / ${n(expected)}`);
    batch = [];
  };

  console.log('  Loading…');
  for await (const page of fetchAll(buildWhere(query), 1000, appToken)) {
    fetched += page.length;
    for (const record of page as FraRecord[]) {
      const result = toCrossingRow(record);
      if ('skip' in result) {
        skipped.set(result.skip, (skipped.get(result.skip) ?? 0) + 1);
        continue;
      }
      batch.push(result.row);
      if (batch.length >= options.batchSize) await flush();
    }
  }
  await flush();

  console.log('');
  console.log('');
  console.log('  Result');
  console.log('  ' + '─'.repeat(76));
  console.log(`    fetched from FRA          ${n(fetched).padStart(8)}`);
  console.log(`    upserted into crossings   ${n(upserted).padStart(8)}`);
  if (skipped.size > 0) {
    console.log('    skipped:');
    for (const [reason, howMany] of skipped) {
      console.log(`      ${reason.padEnd(34)} ${n(howMany).padStart(6)}`);
    }
  }
  console.log('');
  console.log('  Re-running this command is safe — it upserts on dot_id.');
  console.log('');
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if ((line + ' ' + word).trim().length > width) {
      lines.push(line.trim());
      line = word;
    } else {
      line += ' ' + word;
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

main().catch((error: unknown) => {
  console.error('');
  console.error('✗ Ingest failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
