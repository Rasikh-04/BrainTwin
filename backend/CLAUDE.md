# CLAUDE.md (backend, Tabeen's domain)

Scope: this directory is the offline Python preprocessing. It reads raw datasets and writes contract-shaped JSON plus processed assets into the frontend's `/public` tree (or into `/contract/fixtures` while data is still being staged). It never runs at the app's runtime. Read the root `CLAUDE.md`, `docs/MEDICAL_ACCURACY.md`, and `docs/DATA_CONTRACT.md` before writing anything here.

## What this side produces

Everything the frontend consumes:

- `brain-cortical.glb` and `brain-subcortical.glb` with node names equal to `region_id`.
- `regions.json`, `disorders.json`, and one `cases/<case_id>.json` per case.
- Per case: NIfTI base and mask, or the atrophy scan pair, or the EEG spectrogram PNG and waveform JSON.
- Computed `region_mappings` with real overlap metrics and provenance for lesion cases.

## Environment and libraries

- Python. `nibabel` and `nilearn` for NIfTI and atlases, `MNE-Python` for EDF reading and EEG windowing, `numpy` and `scipy` for the overlap math and spectrograms, `trimesh` or `pygltflib` for OBJ to glb conversion and node naming, optionally FreeSurfer or FSL for parcellation if you go the fsaverage route.
- Keep each pipeline a standalone script with a clear input path and output path. Precompute once, write files, done. No service, no runtime.

## Pipeline steps

Atlas meshes. Either convert the Brainder pre-partitioned per-region OBJ meshes to a single glb per group with one named node per region, or export fsaverage6 `pial` plus `aparc.annot` to the same shape. Node name must equal the `region_id` used in `regions.json`. Subcortical (aseg) structures go in `brain-subcortical.glb`.

Lesion overlap (tumor and stroke). Put the mask and the atlas in the same MNI space. Intersect the lesion mask with each atlas region. For each region the lesion touches, record `overlap_voxels` and `overlap_fraction_of_region`, mark `role` primary or secondary by overlap magnitude (agree a threshold and write it in the provenance), and set `provenance` to the computation. This is the grounded mapping and it must come from the actual intersection, never from assumption.

EEG windowing (epilepsy). Read the EDF with MNE. Use the `chbNN-summary.txt` onset and offset seconds. Extract a window around onset (for example onset minus 10s to offset plus 10s). Render a spectrogram PNG and a downsampled waveform JSON for that window. Record `onset_seconds`, `duration_seconds`, and `involved_channels`. Label the mapping scalp-channel-level and approximate, per the scalp EEG caveat.

Atrophy pair (Alzheimer's). Select a CDR 0 scan and a CDR 1 or 2 scan. Place both NIfTI files. The affected-region set is a cited literature pattern plus the visible atrophy, not a segmentation. Emit `evidence_type: "atrophy"` mappings with the CDR rating and a citation in provenance. Do not fabricate a per-voxel atrophy mask.

## Grounding rules that bind this side hardest

- Region mappings for tumor and stroke come from the mask intersection you compute. Do not add a region because it is "usually" involved.
- Do not write anatomical or clinical prose into `regions.json`, `disorders.json`, or `report_summary` from general knowledge. Use `NEEDS_SOURCE` and a `TODO(neuro-review)` note. Only transcribe descriptions from a reference the user actually provides, and record that reference in the `_source` field.
- Use only the de-identified fields the dataset provides for `anonymized_meta`. Invent nothing.
- Every case ships `review_status: "pending"`.

## Contract discipline

The shapes in `/contract` are shared. If a preprocessing need seems to require a new field, that is a `contract/*` pull request reviewed by Mannan, not a quiet change here. Run the contract validator before opening a pull request. Land the schema and fixtures as the first pull request so the frontend is unblocked immediately; real data replaces fixtures in the same shapes afterward.
