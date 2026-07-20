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
# rget "$ENC_URL" "${OUT}/ATLAS_R2.0_encrypted.tar.gz"

# Option B: anonymous S3 (needs awscli: pip install awscli). Selective and resumable.
# aws s3 cp --no-sign-request \
#   s3://fcp-indi/data/Projects/INDI/ATLAS/R2.1/ "${OUT}/" --recursive

# Decrypt (exact command and password are shown on the download page), for example:
# openssl aes-256-cbc -md sha256 -d \
#   -in "${OUT}/ATLAS_R2.0_encrypted.tar.gz" -out "${OUT}/ATLAS.tar.gz"
# tar -xzf "${OUT}/ATLAS.tar.gz" -C "${OUT}"

# Then keep ~8 subject folders and delete the rest to reclaim the 4 GB.

echo "ATLAS is one encrypted tarball. Uncomment the steps above once you have the URL and password."
echo "If bandwidth is tight, skip stroke: it shares the tumor renderer."
