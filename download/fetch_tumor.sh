#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib_fetch.sh"

# BraTS 2021 tumor cases, per subject, only the files we need.
# We pull one anatomical modality (t1ce) plus the tumor mask (seg) per subject.
# This avoids the single ~13 GB Kaggle tar entirely.
#
# Mask labels in BraTS: 1 necrotic core, 2 edema, 4 enhancing tumor.
#
# NOTE: HF mirror repos can move. This repo has the per-subject layout at the time
# of writing; if it 404s or 401s, find any Hugging Face repo with the same path pattern
# (BraTS2021_XXXXX/BraTS2021_XXXXX_t1ce.nii.gz) and swap REPO/BASE.

REPO="${BRATS_REPO:-rocky93/BraTS_segmentation}"
BASE="https://huggingface.co/datasets/${REPO}/resolve/main"
OUT="data/raw/tumor"

# Pick ~8 subjects. Swap these ids for any that exist in the repo.
SUBJECTS=(00000 00002 00003 00005 00006 00008 00011 00009)

# t1ce reads best for tumor core; seg is the mask. Add flair for a second modality if wanted.
FILES=(t1ce seg)

for s in "${SUBJECTS[@]}"; do
  for f in "${FILES[@]}"; do
    rget "${BASE}/BraTS2021_${s}/BraTS2021_${s}_${f}.nii.gz" \
         "${OUT}/BraTS2021_${s}/BraTS2021_${s}_${f}.nii.gz"
  done
done

echo "Tumor done: ${#SUBJECTS[@]} subjects x ${#FILES[@]} files in ${OUT} (approx 150 MB)"
