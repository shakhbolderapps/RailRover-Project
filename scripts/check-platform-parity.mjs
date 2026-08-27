#!/usr/bin/env node
/**
 * Platform parity check — Android and iOS must never drift.
 *
 * Client directive: test on Android for now, but the iOS codebase must never fall behind.
 * This script is the mechanical enforcement of that. See docs/PLATFORM-PARITY.md.
 *
 * Fails on:
 *   1. Orphan platform file variants   — Foo.android.tsx with no Foo.ios.tsx (or vice versa)
 *   2. One-armed Platform.select       — a select() missing an ios/android/default key
 *   3. Unguarded Platform.OS branches  — an android-only branch with no iOS path
 *   4. Unpaired native permissions     — an Android permission with no declared iOS counterpart
 *   5. Missing iOS purpose strings     — a declared iOS permission with no usage description
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, basename, dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const MOBILE = join(ROOT, 'apps/mobile');
const SKIP_DIRS = new Set(['node_modules', '.expo', 'dist', 'build', 'android', 'ios', '.git']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx']);

const failures = [];
const notes = [];

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (CODE_EXT.has(extname(full))) out.push(full);
  }
  return out;
}

const files = walk(MOBILE);

/* ---- 1. Orphan platform file variants ------------------------------------------------ */
const PLATFORM_SUFFIX = /\.(android|ios|native)(\.[tj]sx?)$/;
for (const file of files) {
  const name = basename(file);
  const match = name.match(PLATFORM_SUFFIX);
  if (!match || match[1] === 'native') continue;
  const [, platform, ext] = match;
  const other = platform === 'android' ? 'ios' : 'android';
  const sibling = join(dirname(file), name.replace(`.${platform}${ext}`, `.${other}${ext}`));
  // A shared fallback (Foo.tsx) also satisfies parity.
  const shared = join(dirname(file), name.replace(`.${platform}${ext}`, ext));
  if (!existsSync(sibling) && !existsSync(shared)) {
    failures.push(
      `[orphan-platform-file] ${relative(ROOT, file)}\n` +
        `    has no ${other} counterpart and no shared fallback.\n` +
        `    Create ${basename(sibling)} or ${basename(shared)} in the same commit.`,
    );
  }
}

/* ---- 2 & 3. One-armed platform branches --------------------------------------------- */
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);

  // Platform.select({ ... }) — must mention ios and android, or default.
  const selectRe = /Platform\.select\s*\(\s*\{/g;
  let m;
  while ((m = selectRe.exec(src)) !== null) {
    // Brace-match to find the object literal body.
    let depth = 0;
    let i = m.index + m[0].length - 1;
    let body = '';
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) break;
      }
      if (depth > 0 && i > m.index + m[0].length - 1) body += ch;
    }
    const hasIos = /\bios\s*:/.test(body);
    const hasAndroid = /\bandroid\s*:/.test(body);
    const hasDefault = /\bdefault\s*:/.test(body);
    if (!hasDefault && !(hasIos && hasAndroid)) {
      const line = src.slice(0, m.index).split('\n').length;
      failures.push(
        `[one-armed-platform-select] ${rel}:${line}\n` +
          `    Platform.select() has ${hasIos ? 'ios' : 'android'} only.\n` +
          `    Add the missing platform key, or a 'default'. iOS must never be left undefined.`,
      );
    }
  }

  // Platform.OS === 'android' with no ios/else path anywhere in the file.
  const osChecks = [...src.matchAll(/Platform\.OS\s*===\s*['"](android|ios)['"]/g)];
  if (osChecks.length > 0) {
    const platforms = new Set(osChecks.map((c) => c[1]));
    const hasElse = /\}\s*else\b/.test(src) || /\?\s*[^:]+:/.test(src) || /Platform\.select/.test(src);
    if (platforms.size === 1 && !hasElse) {
      const only = [...platforms][0];
      const line = src.slice(0, osChecks[0].index).split('\n').length;
      failures.push(
        `[one-armed-platform-branch] ${rel}:${line}\n` +
          `    Only Platform.OS === '${only}' is handled, with no else/ternary path.\n` +
          `    The other platform must have a correct path, not an implicit no-op.`,
      );
    }
  }
}

/* ---- 4 & 5. Native permission pairing ------------------------------------------------ */
const parityManifest = join(MOBILE, 'platform-parity.json');
if (!existsSync(parityManifest)) {
  failures.push(
    `[missing-manifest] apps/mobile/platform-parity.json not found.\n` +
      `    It declares the Android<->iOS capability pairs this script enforces.`,
  );
} else {
  const manifest = JSON.parse(readFileSync(parityManifest, 'utf8'));
  const configPath = join(MOBILE, 'app.config.ts');
  const config = existsSync(configPath) ? readFileSync(configPath, 'utf8') : '';

  for (const pair of manifest.capabilities ?? []) {
    const { capability, android = [], ios = {}, status } = pair;
    const androidPresent = android.filter((p) => config.includes(p));
    const iosKeys = Object.keys(ios);
    const iosPresent = iosKeys.filter((k) => config.includes(k));

    // An Android permission in app.config.ts whose iOS counterpart is absent = drift.
    if (androidPresent.length > 0 && iosKeys.length > 0 && iosPresent.length === 0) {
      failures.push(
        `[unpaired-permission] capability "${capability}"\n` +
          `    Android declares: ${androidPresent.join(', ')}\n` +
          `    iOS declares:     (nothing) — expected one of: ${iosKeys.join(', ')}\n` +
          `    Add the iOS declaration to app.config.ts in this same commit.`,
      );
    }
    // Declared iOS permission with an empty purpose string = App Store rejection.
    for (const [key, expectation] of Object.entries(ios)) {
      if (!config.includes(key)) continue;
      if (expectation === 'usage-description') {
        const re = new RegExp(`${key}\\s*:\\s*(['"\`])([^'"\`]*)\\1`);
        const found = config.match(re);
        if (found && found[2].trim().length < 20) {
          failures.push(
            `[weak-purpose-string] ${key}\n` +
              `    Purpose string is missing or too short to pass App Store review.\n` +
              `    Write an honest sentence explaining why RailRover needs this.`,
          );
        }
      }
    }
    if (status === 'deferred') {
      notes.push(`capability "${capability}" is deferred for BOTH platforms (see gap register)`);
    }
  }
}

/* ---- Report -------------------------------------------------------------------------- */
const scanned = files.length;
if (failures.length > 0) {
  console.error(`\n✗ Platform parity check FAILED (${failures.length} issue(s))\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  console.error('  Android and iOS must ship in the same commit. See docs/PLATFORM-PARITY.md\n');
  process.exit(1);
}
console.log(`✓ Platform parity OK — ${scanned} mobile source file(s) scanned.`);
for (const n of notes) console.log(`  note: ${n}`);
