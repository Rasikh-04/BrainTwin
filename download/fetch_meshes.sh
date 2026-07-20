#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib_fetch.sh"

# Brain atlas meshes for the clickable brain (step 1).
# Brainder publishes per-region Desikan-Killiany plus subcortical meshes in OBJ,
# Creative Commons licensed. This is the fast route and avoids running FreeSurfer.
#
# The old "Surface models" page (brainder.org/download/brain-surfaces/) has moved;
# the pack now lives under the brain4blender research page:
#   https://brainder.org/research/brain-for-blender/
# with files served from brainder's S3 bucket. If these URLs ever 404, browse that
# page again and swap BASE for whatever it links to.
#
# Alternative (if you run FreeSurfer): export fsaverage6 pial + aparc.annot to the
# same named-node glb shape. fsaverage needs a free FreeSurfer registration.

BASE="https://s3.us-east-2.amazonaws.com/brainder/software/brain4blender/smallfiles"
OUT="data/raw/meshes"

rget "${BASE}/pial_DK_obj.tar.bz2"      "${OUT}/pial_DK_obj.tar.bz2"
rget "${BASE}/subcortical_obj.tar.bz2"  "${OUT}/subcortical_obj.tar.bz2"

tar -xjf "${OUT}/pial_DK_obj.tar.bz2"     -C "${OUT}"
tar -xjf "${OUT}/subcortical_obj.tar.bz2" -C "${OUT}"

echo "Meshes done: DK cortical + subcortical OBJ packs extracted in ${OUT}"
echo "Next: convert the OBJ files to glb and merge into two files with one named node"
echo "per region, node name equal to region_id, per docs/DATA_CONTRACT.md:"
echo "  brain-cortical.glb  and  brain-subcortical.glb"
