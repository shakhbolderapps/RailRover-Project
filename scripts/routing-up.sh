#!/usr/bin/env bash
# Bring up a local Valhalla routing container on an Ohio/Michigan/Indiana OSM extract.
#
# Why: OpenRouteService's free tier allows 2,000 routes/day. Automated tests must never spend
# that. A local router gives unlimited, deterministic, offline routing for dev and CI.
#
# STATUS: blocked — Docker is not installed on this machine. See
# decisions/0007-no-docker-local-supabase-substitute.md. Until Docker exists, automated tests
# bind FixtureRoutingAdapter instead (zero quota, no network), so nothing is blocked on this.
set -euo pipefail

DATA_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data/osm"
EXTRACTS=(
  "https://download.geofabrik.de/north-america/us/ohio-latest.osm.pbf"
  "https://download.geofabrik.de/north-america/us/michigan-latest.osm.pbf"
  "https://download.geofabrik.de/north-america/us/indiana-latest.osm.pbf"
)

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'MSG'
✗ Docker is not installed, so the local routing container cannot start.

  This is a known, documented gap — see decisions/0007-no-docker-local-supabase-substitute.md.
  Nothing is blocked by it right now: automated tests use FixtureRoutingAdapter, which is
  deterministic, offline, and spends no ORS quota.

  To unblock local routing (recommended, ~10 minutes):
    brew install --cask docker      # or: brew install colima && colima start
  Then re-run: pnpm routing:up

  Once Docker is available, add LocalValhallaAdapter behind the same RoutingAdapter interface
  (packages/shared/src/routing) — no app or test code needs to change.
MSG
  exit 1
fi

mkdir -p "$DATA_DIR"
for url in "${EXTRACTS[@]}"; do
  file="$DATA_DIR/$(basename "$url")"
  if [ -f "$file" ]; then
    echo "▸ Already have $(basename "$file")"
  else
    echo "▸ Downloading $(basename "$url")… (this is large, several hundred MB)"
    curl -fL --progress-bar "$url" -o "$file"
  fi
done

echo "▸ Starting Valhalla (first run builds tiles — expect 20+ minutes)…"
docker run -d --name railrover-valhalla \
  -p 8002:8002 \
  -v "$DATA_DIR:/custom_files" \
  -e serve_tiles=True -e build_elevation=False -e build_admins=True \
  ghcr.io/gis-ops/docker-valhalla/valhalla:latest

cat <<'MSG'

✓ Valhalla starting on http://localhost:8002
  Health:  curl -s localhost:8002/status | head
  Stop:    docker stop railrover-valhalla && docker rm railrover-valhalla

  Valhalla's exclude_polygons mirrors ORS avoid_polygons, so the reroute heuristic
  (decisions/0005) behaves the same against both.
MSG
