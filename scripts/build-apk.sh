#!/usr/bin/env bash
# Build a local Android APK. Unlimited and free — no EAS build credits, no Play Console account.
#
# Usage: pnpm apk [debug|release]
#
# The Play Console account ($25 one-time) is a client-owned SOW dependency and is not funded yet.
# Until it is, pilot testers install this APK directly or through Firebase App Distribution.
set -euo pipefail

VARIANT="${1:-release}"
MOBILE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../apps/mobile" && pwd)"
cd "$MOBILE_DIR"

if [ ! -f google-services.json ]; then
  echo "⚠  google-services.json not found — FCM push will not work in this build."
  echo "   Download it from the Firebase console (free, no billing) into apps/mobile/."
  echo "   Continuing: everything except push works without it."
  echo
fi

echo "▸ Generating the Android project (expo prebuild)…"
npx expo prebuild --platform android --clean --no-install

echo "▸ Assembling ${VARIANT} APK…"
cd android
case "$VARIANT" in
  debug)   ./gradlew assembleDebug --no-daemon ;;
  release) ./gradlew assembleRelease --no-daemon ;;
  *) echo "Unknown variant '$VARIANT' — use debug or release." >&2; exit 1 ;;
esac

APK=$(find app/build/outputs/apk -name '*.apk' -newermt '-5 minutes' | head -1)
if [ -z "$APK" ]; then
  echo "✗ No APK produced." >&2
  exit 1
fi

echo
echo "✓ APK: $MOBILE_DIR/android/$APK"
echo "  Install on a connected device or running emulator:"
echo "    adb install -r \"$MOBILE_DIR/android/$APK\""
