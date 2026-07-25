#!/usr/bin/env bash
#
# Drive the whole BrainTwin POC through a ~1 minute scripted walkthrough, paced for
# a screen recording. Re-runnable: the Chrome profile and the Next build are cached
# between runs, so only the first run pays the cold-start cost.
#
#   ./demo/record-demo.sh              # warm up, then run with your own screencast
#   ./demo/record-demo.sh --video      # same, but Playwright records it to webm/mp4
#   ./demo/record-demo.sh --warm-only  # just prime the caches, record later
#   ./demo/record-demo.sh --dev        # drive the dev server instead of a prod build
#
# Why a production build by default: `next dev` compiles routes on first request, so
# the first navigation of a cold run stalls for seconds and the atlas judders. That is
# the lag you see in Chrome and not in Firefox. `next build` + `next start` removes it.
#
# Why a persistent Chrome profile: the atlas glbs and the case NIfTI volumes are tens
# of MB. A throwaway profile refetches and re-parses them every run. Pointing every run
# at the same profile dir means the second run onward starts warm.
set -euo pipefail

cd "$(dirname "$0")/.."   # frontend/

MODE="prod"
VIDEO=0
WARM_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --video) VIDEO=1 ;;
    --warm-only) WARM_ONLY=1 ;;
    --dev) MODE="dev" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

export DEMO_URL="${DEMO_URL:-http://localhost:3000}"
export DEMO_PROFILE="${DEMO_PROFILE:-/tmp/braintwin-demo-profile}"
export DEMO_SPEED="${DEMO_SPEED:-1}"
export DEMO_WIDTH="${DEMO_WIDTH:-1600}"
export DEMO_HEIGHT="${DEMO_HEIGHT:-900}"

# --------------------------------------------------------------------------- #
# Preflight: the demo is only honest if the built data is actually on disk.
# Case assets are git-ignored (DUA), so a fresh clone has none and the evidence
# half of the walkthrough would silently show empty viewers.
# --------------------------------------------------------------------------- #
missing=0
for f in public/data/regions.json public/data/disorders.json \
         public/assets/atlas/brain-cortical.glb; do
  [ -f "$f" ] || { echo "missing: frontend/$f"; missing=1; }
done
for c in brats-001 atlas-001 chbmit-01 oasis-001; do
  [ -d "public/assets/cases/$c" ] || { echo "missing case assets: $c"; missing=1; }
done
if [ "$missing" -ne 0 ]; then
  echo
  echo "Run the preprocessing first:  python3 backend/build_dataset.py  (from the repo root)"
  exit 1
fi

# --------------------------------------------------------------------------- #
# Server
# --------------------------------------------------------------------------- #
SERVER_PID=""
cleanup() {
  [ -n "$SERVER_PID" ] && kill "$SERVER_PID" 2>/dev/null || true
}
trap cleanup EXIT

if curl -sf -o /dev/null --max-time 2 "$DEMO_URL"; then
  echo "reusing the server already on $DEMO_URL"
else
  if [ "$MODE" = "prod" ]; then
    if [ ! -d .next/BUILD_ID ] && [ ! -f .next/BUILD_ID ]; then
      echo "building the app (one time; later runs reuse .next)..."
      npm run build
    fi
    echo "starting next start..."
    npm run start >/tmp/braintwin-demo-server.log 2>&1 &
  else
    echo "starting next dev..."
    npm run dev >/tmp/braintwin-demo-server.log 2>&1 &
  fi
  SERVER_PID=$!
  printf "waiting for %s" "$DEMO_URL"
  for _ in $(seq 1 90); do
    curl -sf -o /dev/null --max-time 2 "$DEMO_URL" && break
    printf "."
    sleep 1
  done
  echo
  curl -sf -o /dev/null --max-time 2 "$DEMO_URL" || {
    echo "server never came up; see /tmp/braintwin-demo-server.log" >&2
    exit 1
  }
fi

# --------------------------------------------------------------------------- #
# Warm pass: headless, fetches every asset the visible run will need.
# This is the fix for "Chrome takes a while to fill up the cache".
# --------------------------------------------------------------------------- #
echo
DEMO_WARMUP=1 node demo/demo.mjs

if [ "$WARM_ONLY" -eq 1 ]; then
  echo
  echo "caches are warm. run  ./demo/record-demo.sh  when you are ready to record."
  exit 0
fi

# --------------------------------------------------------------------------- #
# The visible run
# --------------------------------------------------------------------------- #
if [ "$VIDEO" -eq 1 ]; then
  export DEMO_VIDEO=1
  export DEMO_VIDEO_DIR="demo/recordings"
  mkdir -p "$DEMO_VIDEO_DIR"
  echo
  echo "Playwright will capture the page to $DEMO_VIDEO_DIR (Wayland-safe: no x11grab)."
else
  echo
  echo "Start your screencast now. The walkthrough begins in 8 seconds."
  echo "A ${DEMO_WIDTH}x${DEMO_HEIGHT} Chrome window will open at the top-left of the screen."
  for i in $(seq 8 -1 1); do printf "\r  %d " "$i"; sleep 1; done
  printf "\r      \n"
fi

node demo/demo.mjs

if [ "$VIDEO" -eq 1 ]; then
  latest="$(ls -t demo/recordings/*.webm 2>/dev/null | head -1 || true)"
  if [ -n "$latest" ]; then
    out="demo/recordings/braintwin-poc-$(date +%Y%m%d-%H%M%S).mp4"
    if command -v ffmpeg >/dev/null; then
      # webm plays everywhere a browser is involved, but mp4 is what slide decks and
      # messaging apps want. Re-encode rather than remux: VP8/9 in mp4 is not portable.
      ffmpeg -loglevel error -y -i "$latest" -c:v libx264 -pix_fmt yuv420p -crf 20 "$out"
      echo "recording: $out"
    else
      echo "recording: $latest  (install ffmpeg for an mp4)"
    fi
  else
    echo "no video produced; check the run output above" >&2
  fi
fi
