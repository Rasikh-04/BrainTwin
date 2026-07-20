#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib_fetch.sh"

# CHB-MIT epilepsy. Only a few seizure-containing recordings plus annotations.
# The full set is 600+ EDF files (tens of GB). We need 2 to 3 seizure recordings.
# After preprocessing you ship only a spectrogram PNG and a small waveform JSON,
# so the raw EDF is throwaway once the window is extracted.

BASE="https://physionet.org/files/chbmit/1.0.0"
OUT="data/raw/epilepsy"

# Tiny metadata first (a few KB each).
rget "${BASE}/RECORDS-WITH-SEIZURES"    "${OUT}/RECORDS-WITH-SEIZURES"
rget "${BASE}/SUBJECT-INFO"             "${OUT}/SUBJECT-INFO"
rget "${BASE}/chb01/chb01-summary.txt"  "${OUT}/chb01/chb01-summary.txt"

# Seizure recordings from subject chb01 (each ~40 MB) plus their seizure annotations.
# chb01_03, _04, _15 all contain annotated seizures. Adjust using RECORDS-WITH-SEIZURES.
for rec in chb01_03 chb01_04 chb01_15; do
  rget "${BASE}/chb01/${rec}.edf"           "${OUT}/chb01/${rec}.edf"
  rget "${BASE}/chb01/${rec}.edf.seizures"  "${OUT}/chb01/${rec}.edf.seizures"
done

echo "Epilepsy done: 3 seizure recordings in ${OUT} (approx 150 MB)"
