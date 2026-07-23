#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib_fetch.sh"

# ATLAS v2.0 stroke.
# There is NO per-case option. The data ships as one encrypted tarball:
#   raw data ~4.0 GB, or preprocessed ~9.7 GB.
# Plan: download the 4 GB once with resume, decrypt, keep ~8 subjects, delete the rest.
#
# Stroke reuses the SAME renderer as tumor (lesion mask over a scan). So if disk or
# bandwidth is tight, SKIP this file entirely and ship the lesion-overlay story with
# BraTS alone. Stroke is upside, not a requirement.
#
# You get the download URL and the decryption password after agreeing to the terms:
#   http://fcon_1000.projects.nitrc.org/indi/retro/atlas_download.html
# The same data is also on an anonymous S3 bucket: s3://fcp-indi/data/Projects/INDI/ATLAS/R2.1

OUT="data/raw/stroke"
mkdir -p "$OUT"

# Option A: direct download of the encrypted tarball (resumable). Paste the URL, then run.
# ENC_URL="<paste the NITRC download URL from the page above>"
# rget "$ENC_URL" "${OUT}/atlas3_training_raw.tar.gz"

# Option B: anonymous S3 (needs awscli: pip install awscli). Selective and resumable.
# aws s3 cp --no-sign-request \
#   s3://fcp-indi/data/Projects/INDI/ATLAS/R2.1/ "${OUT}/" --recursive

# --------------------------------------------------------------------------- #
# Decrypt + selective extract (what was actually run for the archive in hand)
# --------------------------------------------------------------------------- #
# The tarball is openssl aes-256-cbc, base64-armoured (hence -a), with the emailed key.
# Put the key alone on the first line of a file; ${OUT}/key.txt is the whole email, so
# copy just the key out of it. Never commit the key: data/raw/* is git-ignored.
#
# Do NOT decrypt to disk first. The archive is ~8 GB armoured / ~6 GB tar, and we only
# need 8 subjects out of 1453. Pipe the decrypt straight into tar and extract by pattern,
# so nothing but the kept files ever touches disk:
#
#   ARCHIVE=~/Downloads/atlas3_training_raw.tar.gz
#   PASS=/path/to/keyfile     # first line = the key only
#
#   # pass 1: masks + metadata only (~96 MB), so the demo case is chosen from real data
#   openssl aes-256-cbc -md sha256 -d -a -in "$ARCHIVE" -pass file:"$PASS" \
#     | tar -xz -C "$OUT" --wildcards '*_mask.nii.gz' '*_metadata.csv'
#
#   # score every mask, then pass 2: pull the T1w for the chosen subjects only
#   openssl aes-256-cbc -md sha256 -d -a -in "$ARCHIVE" -pass file:"$PASS" \
#     | tar -xz -C "$OUT" --wildcards '*sub-r009s052*_T1w.nii.gz' ...
#
#   # finally delete every subject dir that is not a keeper
#
# Selection rule (mirrors select_stroke_case in backend/build_dataset.py): lesion voxel
# count nearest 15000 within a 2000-80000 window, restricted to 1 mm isotropic subjects so
# a voxel count equals a cc. The 8 kept are r009s052 r024s018 r038s015 r003s014 r057s021
# r057s044 r070s010 r040s080.
#
# IMPORTANT: this is the RAW release, BIDS space-orig (native scanner space), NOT
# MNI-normalized. build_stroke() detects that and registers before the atlas overlap.
# See docs/DATA_SOURCES.md.

echo "ATLAS is one encrypted tarball. Uncomment the steps above once you have the URL and password."
echo "If bandwidth is tight, skip stroke: it shares the tumor renderer."
