# /contract

This is the wiring between backend and frontend. It lands before either side builds. The full spec is `docs/DATA_CONTRACT.md`. This folder holds the example fixtures and the validator.

Contents:

- `fixtures/regions.example.json` a few real Desikan-Killiany and aseg regions in the region shape.
- `fixtures/disorders.example.json` all four disorders in the disorder shape.
- `fixtures/case-glioma.example.json` a lesion-overlay case (tumor). Stroke uses the same shape.
- `fixtures/case-epilepsy.example.json` an eeg case.
- `fixtures/case-alzheimers.example.json` an atrophy-pair case.

Rules that never bend:

- Missing content is `NEEDS_SOURCE` or an empty array, never an invented value.
- Every region mapping carries provenance: a computation for lesion cases, a citation for pattern cases.
- Everything ships `review_status: "pending"`.

The validator is `validate.py`. It checks: mesh node names match `regions.json` both ways, every `case.disorder_id` exists, every mapped `region_id` exists, every referenced asset path exists (with `--check-assets`), and no field holds invented content where a `NEEDS_SOURCE` marker belongs. CI runs it on every pull request (`.github/workflows/contract-validate.yml`); red blocks merge.

```bash
python3 contract/validate.py                 # structural (what CI runs)
python3 contract/validate.py --check-assets  # also verify asset files exist locally
```

## Real wired dataset (not just examples)

Alongside the `*.example.json` templates, this folder now holds the real, cross-referenced set the app loads, generated from the downloaded data by `backend/build_dataset.py`:

- `fixtures/regions.json` 100 real regions (68 Desikan-Killiany cortical + 32 aseg subcortical), ids joined to the glb node names.
- `fixtures/disorders.json` all four disorders. `glioma` and `epilepsy` are wired to cases; `ischemic-stroke` and `alzheimers` are listed with empty `case_ids` (data deferred).
- `fixtures/cases/brats-001.json` real tumor scan + mask (`region_mappings` empty pending the overlap pipeline).
- `fixtures/cases/chbmit-01.json` real seizure window (onset 2996 s), waveform + spectrogram, scalp-level mapping.

The same JSON is mirrored to `frontend/public/data/` (the fetch paths). Atlas glbs are committed under `frontend/public/assets/atlas/`; patient-derived case assets are git-ignored and regenerated locally. See `backend/README.md`.

Change process: a change to any shape here is a `contract/*` pull request reviewed by both developers, because both sides depend on it.
