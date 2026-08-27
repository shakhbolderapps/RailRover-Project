#!/usr/bin/env bash
# Environment check: what works, what is missing, and what each gap actually blocks.
# Deliberately reports honestly rather than claiming a green setup.
set -uo pipefail

ok=0; warn=0; fail=0
check() { # name  command  requirement(required|optional)  blocks
  local name="$1" cmd="$2" req="$3" blocks="$4" version=""
  if version=$(eval "$cmd" 2>/dev/null | head -1); then
    printf '  ✓ %-22s %s\n' "$name" "$version"; ((ok++))
  elif [ "$req" = required ]; then
    printf '  ✗ %-22s MISSING — blocks: %s\n' "$name" "$blocks"; ((fail++))
  else
    printf '  ○ %-22s not installed — blocks: %s\n' "$name" "$blocks"; ((warn++))
  fi
}

echo
echo "RailRover environment"
echo "─────────────────────────────────────────────────────────────────"
check "node"        "node --version"                    required "everything"
check "pnpm"        "pnpm --version"                    required "everything"
check "java"        "java -version 2>&1"                required "Android builds"
check "adb"         "adb --version"                     required "Android install/run"
check "git"         "git --version"                     required "version control"
check "python3"     "python3 --version"                 required "spec generation from the SOW"
check "docker"      "docker --version"                  optional "local Supabase + local routing (ADR 0007 — fixtures cover tests)"
check "supabase"    "supabase --version"                optional "migration push (npx supabase works too)"
check "xcodebuild"  "xcodebuild -version 2>&1"          optional "iOS simulator layout checks (no Apple account needed)"

echo
echo "Android devices / emulators"
echo "─────────────────────────────────────────────────────────────────"
if command -v adb >/dev/null 2>&1; then
  devices=$(adb devices | sed -n '2,$p' | grep -c device || true)
  echo "  attached devices: ${devices:-0}"
fi
if command -v emulator >/dev/null 2>&1; then
  emulator -list-avds 2>/dev/null | sed 's/^/  avd: /'
fi

echo
echo "Client-owned SOW dependencies (not engineering gaps)"
echo "─────────────────────────────────────────────────────────────────"
echo "  ○ Apple Developer Program (\$99/yr) — blocks iOS device builds, TestFlight, APNs push"
echo "  ○ Google Play Console (\$25 once)   — blocks public Play listing (APK sideload works)"
echo "  ✓ Google Maps Platform billing     — not needed; MapLibre + ORS (ADR 0001)"

echo
echo "─────────────────────────────────────────────────────────────────"
printf '  %d ok, %d optional missing, %d required missing\n' "$ok" "$warn" "$fail"
[ "$fail" -eq 0 ] && echo "  Ready to develop (Android target)." || echo "  Install the required tools above first."
echo
exit 0
