#!/usr/bin/env bash
#
# download_ct_ich_samples.sh
#
# Selectively downloads a handful of hand-picked cases from the PhysioNet
# "Computed Tomography Images for Intracranial Hemorrhage Detection and
# Segmentation" dataset (Hssayeni et al., 2020) — used here to add
# hemorrhagic stroke cases (varying position/intensity) to the Brain
# Digital Twin POC alongside the ATLAS ischemic stroke cases.
#
# Dataset: https://physionet.org/content/ct-ich/1.3.1/
# Citation: Hssayeni, M. (2020). Computed Tomography Images for
#   Intracranial Hemorrhage Detection and Segmentation (v1.3.1). PhysioNet.
#   https://doi.org/10.13026/4nae-zg36
#
# PREREQS (same friction level as ATLAS — a DUA, not full CITI credentialing):
#   1. Create a free PhysioNet account:  https://physionet.org/register/
#   2. Sign the Data Use Agreement for this project:
#        https://physionet.org/sign-dua/ct-ich/1.3.1/
#   3. Have `wget` installed.
#
# USAGE:
#   chmod +x download_ct_ich_samples.sh
#   ./download_ct_ich_samples.sh <physionet_username>
#
# NOTE ON FILENAMES: I could not browse the authenticated file listing
# (it's login-gated), so the exact filename pattern for ct_scans/ and
# masks/ is inferred from the dataset docs, not verified byte-for-byte.
# Step 1 below pulls the two label CSVs first specifically so you can
# confirm real patient IDs and pick subtype/location variety before
# step 2 tries to pull the NIfTI files. If a filename guess 404s, the
# script tells you so you can adjust the ID format from the CSV.

set -euo pipefail

USERNAME="${1:?Usage: $0 <physionet_username>}"
BASE_URL="https://physionet.org/files/ct-ich/1.3.1"

# Stage straight into the tree the pipeline globs (backend _find_hemorrhage_cases
# looks for any ct_scans/ + sibling masks/ under data/raw/hemorrhage). data/raw
# is gitignored, so nothing here is ever committed. Resolve it from the script's
# own location so this works regardless of the caller's working directory.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OUT_DIR="$REPO_ROOT/data/raw/hemorrhage/ct_ich"

mkdir -p "$OUT_DIR/ct_scans" "$OUT_DIR/masks"

echo "=== Step 1: pulling label/demographics CSVs (small, no case selection needed) ==="
echo "You'll be prompted for your PhysioNet password (input hidden)."
wget -c --user "$USERNAME" --ask-password \
     -P "$OUT_DIR" \
     "$BASE_URL/patient_demographics.csv" \
     "$BASE_URL/hemorrhage_diagnosis_raw_ct.csv"

echo
echo "Open $OUT_DIR/patient_demographics.csv now. Pick 2-4 patient numbers"
echo "that cover DIFFERENT hemorrhage subtypes (IVH/IPH/SAH/EDH/SDH) and,"
echo "ideally, different lesion sizes — that's what gives you the position/"
echo "intensity variability your instructor asked for."
echo

# ---- EDIT THIS before running step 2 --------------------------------
# Replace with real patient numbers from patient_demographics.csv.
# The loop below tries the plain form (49) and the zero-padded form (049),
# so either filename convention works without editing here.
# NOTE: subjects #59-#65 are missing from the NIfTI release (82 patients,
# 75 with data) — do not pick any of those. Defaults below steer clear.
PATIENT_IDS=(49 84 100)
# -----------------------------------------------------------------------

echo "=== Step 2: pulling NIfTI scan + mask per selected patient ==="
for ID in "${PATIENT_IDS[@]}"; do
  PADDED=$(printf "%03d" "$ID")

  for CANDIDATE in "$ID" "$PADDED"; do
    echo "Trying patient ${CANDIDATE} ..."

    if wget -c --user "$USERNAME" --ask-password \
         -P "$OUT_DIR/ct_scans" \
         "$BASE_URL/ct_scans/${CANDIDATE}.nii" 2>/dev/null; then
      echo "  ct_scans/${CANDIDATE}.nii OK"
      SCAN_OK=1
    else
      SCAN_OK=0
    fi

    if wget -c --user "$USERNAME" --ask-password \
         -P "$OUT_DIR/masks" \
         "$BASE_URL/masks/${CANDIDATE}.nii" 2>/dev/null; then
      echo "  masks/${CANDIDATE}.nii OK"
      MASK_OK=1
    else
      MASK_OK=0
    fi

    if [[ "$SCAN_OK" == 1 && "$MASK_OK" == 1 ]]; then
      break
    fi
  done

  if [[ "${SCAN_OK:-0}" != 1 || "${MASK_OK:-0}" != 1 ]]; then
    echo "  !! Could not confirm files for patient ${ID}. Check the exact"
    echo "     filename in patient_demographics.csv / the PhysioNet file"
    echo "     browser and adjust PATIENT_IDS or the filename pattern above."
  fi
done

echo
echo "Done. Scans in $OUT_DIR/ct_scans, masks in $OUT_DIR/masks."
echo "These sit under data/raw/hemorrhage, where the pipeline looks for them."
echo
echo "Next: re-run the pipeline to wire the hemorrhagic-stroke cases —"
echo "    cd $REPO_ROOT/backend && python3 build_dataset.py"
echo "build_hemorrhages() will discover the staged subjects, register each"
echo "CT to MNI152, compute the atlas overlap, and emit ctich-NNN cases."
