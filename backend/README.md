# backend

Offline Python preprocessing. Reads `data/raw/*` and emits the contract-shaped
dataset the frontend fetches. Nothing here runs at app runtime. Read the root
`CLAUDE.md`, `docs/MEDICAL_ACCURACY.md`, and `docs/DATA_CONTRACT.md` first.

## Regenerate the wired dataset

```bash
pip install -r backend/requirements.txt
python3 backend/build_dataset.py       # writes JSON + assets
python3 contract/validate.py --check-assets
```

## What `build_dataset.py` produces

Committed to git:

- `contract/fixtures/regions.json`, `disorders.json`, `cases/*.json` (canonical)
- `frontend/public/data/...` (same JSON, at the app's fetch paths)
- `frontend/public/assets/atlas/brain-cortical.glb`, `brain-subcortical.glb`
  (CC-licensed atlas meshes, one named node per `region_id`)

Git-ignored (patient-derived; regenerate locally, do not redistribute):

- `frontend/public/assets/cases/<case_id>/...` (NIfTI, spectrogram, waveform)

## Current cases

| case_id | disorder | renderer | status |
|---|---|---|---|
| `brats-001` | glioma | lesion-overlay | real scan + mask; `region_mappings` EMPTY (see below) |
| `chbmit-01` | epilepsy | eeg | real onset (2996 s), waveform + spectrogram; scalp-level mapping |

`stroke` and `alzheimers` are listed in `disorders.json` with empty `case_ids`.
ATLAS (stroke) is not yet downloaded; the OASIS atrophy pair is deferred.

## Deferred: tumor region overlap (Tabeen's pipeline)

`brats-001.region_mappings` is intentionally `[]`. BraTS is in its own (SRI24)
space, not MNI/DK, so a real mask-to-atlas overlap needs registration into a
shared atlas space. That is the grounded mapping and it must be **computed**, not
guessed (see `docs/MEDICAL_ACCURACY.md`). Fill it by intersecting `mask.nii.gz`
with a DK atlas volume and recording `overlap_voxels`, `overlap_fraction_of_region`,
and `provenance`; mark `role: primary` when the fraction is >= 0.10.
