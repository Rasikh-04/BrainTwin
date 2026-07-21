#!/usr/bin/env bash
#
# Resumable download of source meshes for the vessel / nerve detailing layers.
# See docs/ASSET_SOURCING.md for the full workflow (these are SOURCE files that
# still need a Blender export + alignment pass, not drop-in glbs).
#
# Every download uses `curl -C -` so an interrupted transfer resumes instead of
# restarting. Re-running the script only fetches what is missing or incomplete.
#
# Usage:
#   bash backend/download_detailing_assets.sh
#   bash backend/download_detailing_assets.sh z-anatomy     # one source only
#   bash backend/download_detailing_assets.sh bodyparts3d
#
# Licenses (keep these with any derived, redistributed mesh):
#   Z-Anatomy    CC-BY-SA 4.0
#   BodyParts3D  CC-BY-SA 2.1 Japan

set -euo pipefail

DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/assets_raw"
mkdir -p "$DEST"

# Resumable, fail-loud fetch. Skips a file that is already fully downloaded.
fetch() {
  local url="$1" out="$2"
  echo ">> $out"
  echo "   $url"
  if ! curl -fL --retry 5 --retry-delay 3 -C - -o "$DEST/$out" "$url"; then
    echo "!! Failed: $out" >&2
    echo "   Verify the URL is still current (see docs/ASSET_SOURCING.md)." >&2
    return 1
  fi
}

download_z_anatomy() {
  echo "== Z-Anatomy (CC-BY-SA 4.0) =="
  # The Z-Anatomy meshes live as .blend files in the GitHub repo / releases.
  # Release asset names change between versions, so confirm the current asset at
  # https://github.com/LluisV/Z-Anatomy/releases and set Z_ANATOMY_URL to it.
  # A shallow git clone is the version-stable alternative:
  if [ -n "${Z_ANATOMY_URL:-}" ]; then
    fetch "$Z_ANATOMY_URL" "z-anatomy-source.zip"
  else
    echo "   Z_ANATOMY_URL not set. Cloning the repo instead (resumable via git)."
    if [ -d "$DEST/Z-Anatomy/.git" ]; then
      git -C "$DEST/Z-Anatomy" pull --ff-only
    else
      git clone --depth 1 https://github.com/LluisV/Z-Anatomy "$DEST/Z-Anatomy"
    fi
    echo "   Open the .blend files under $DEST/Z-Anatomy in Blender; export the"
    echo "   cerebral arteries / veins / nerves per docs/ASSET_SOURCING.md."
  fi
}

download_bodyparts3d() {
  echo "== BodyParts3D (CC-BY-SA 2.1 Japan) =="
  # Bulk OBJ archive from the DBCLS download page:
  #   https://lifesciencedb.jp/bp3d/  ->  Downloads
  # Set BP3D_OBJ_URL to the current OBJ archive link from that page, then re-run.
  if [ -n "${BP3D_OBJ_URL:-}" ]; then
    fetch "$BP3D_OBJ_URL" "bodyparts3d-obj.zip"
  else
    echo "   BP3D_OBJ_URL not set. Open https://lifesciencedb.jp/bp3d/ , copy the"
    echo "   current OBJ archive URL from the Downloads section, then run:"
    echo "     BP3D_OBJ_URL='<url>' bash backend/download_detailing_assets.sh bodyparts3d"
  fi
}

target="${1:-all}"
case "$target" in
  z-anatomy)   download_z_anatomy ;;
  bodyparts3d) download_bodyparts3d ;;
  all)         download_z_anatomy; download_bodyparts3d ;;
  *) echo "Unknown target: $target (use z-anatomy | bodyparts3d | all)" >&2; exit 1 ;;
esac

echo
echo "Done. Source files are in $DEST"
echo "Next: Blender export + atlas alignment (docs/ASSET_SOURCING.md)."
