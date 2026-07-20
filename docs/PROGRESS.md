# Progress and handoff (shared)

A running log both developers read. Newest entry on top. It records what has
landed, what is deferred and who owns it, and the risks to keep in view. It is
not a spec (the specs are `docs/DATA_CONTRACT.md` and `docs/MEDICAL_ACCURACY.md`);
it is the shared state of the build.

## 2026-07-20 — Data contract wired to real data (first PR)

Branch: `data/wire-contract-fixtures`. Turns the contract spec into a live,
cross-referenced dataset the frontend fetches, built from the downloaded data
by `backend/build_dataset.py`. Validator is green.

### What landed

- `regions.json` — 100 real regions (68 Desikan-Killiany cortical + 32 aseg
  subcortical), centroids computed from the meshes, `normal_function_description`
  held at `NEEDS_SOURCE` (no invented anatomy).
- `brain-cortical.glb` / `brain-subcortical.glb` — real atlas meshes, one named
  node per `region_id`, decimated (~80k / ~65k verts) for browser perf. Node
  names join to `regions.json` both ways. CC-licensed, committed.
- `disorders.json` — all four disorders. `glioma` and `epilepsy` wired to cases;
  `ischemic-stroke` and `alzheimers` present with empty `case_ids`.
- `cases/chbmit-01.json` (epilepsy) — real seizure window (onset 2996 s from the
  CHB-MIT annotation), 23-channel waveform + spectrogram, mapping labelled
  scalp-channel-level and approximate per the EEG caveat.
- `cases/brats-001.json` (glioma) — real T1ce scan + segmentation mask; the
  Niivue lesion-overlay evidence works today. `region_mappings` is empty on
  purpose (see Deferred).
- `contract/validate.py` + `.github/workflows/contract-validate.yml` — checks
  id joins, enum fields, `NEEDS_SOURCE` pairing, and `review_status: pending`.
  Runs in CI on every PR; red blocks merge.

### How the data contract common ground was formed (role-boundary note)

Per `docs/ROLES_AND_GIT.md`, the contract bootstrap (schema, first fixtures,
atlas meshes, overlap pipeline) sits in Tabeen's `/backend` + `/contract` domain.
This first wiring PR was done from the frontend owner's seat to unblock both
sides at once: it produces the shared shapes and a real dataset so Abdul can
build against actual files instead of waiting, and so Tabeen has a working
skeleton to drop the full pipeline into. Steps taken to reach the common ground:

1. Read the contract spec and the four disorder data sources; inventoried what
   was actually downloaded vs. what the examples implied.
2. Confirmed the decisions that change medical meaning with the team before
   building (case scope, tumor-overlap handling, binary/DUA handling, paths).
3. Built only what the real data honestly supports; deferred the rest with
   explicit TODOs rather than filling gaps.

Land ownership going forward is unchanged: `/backend` and `/contract` are
Tabeen's, `/frontend` is Abdul's. Contract-shape changes remain a `contract/*`
PR reviewed by both. Please review this PR together so the shared shapes are
genuinely agreed, not just inherited.

### Where things live

- JSON: `contract/fixtures/` (canonical) and `frontend/public/data/` (fetch paths).
- Atlas glbs: `frontend/public/assets/atlas/` (committed).
- Patient-derived case assets: `frontend/public/assets/cases/` — **git-ignored**
  (DUA restrictions + no git-lfs). Regenerate locally:
  `pip install -r backend/requirements.txt && python3 backend/build_dataset.py`.

### Deferred (owner)

- **Tumor `region_mappings` (Tabeen).** Left `[]`. BraTS is in SRI24 space, not
  MNI/DK, so real involvement needs registration into a shared atlas space, then
  `mask.nii.gz ∩ DK atlas` with `overlap_voxels` / `overlap_fraction_of_region`
  and `provenance`; mark `role: primary` when fraction ≥ 0.10. Must be computed,
  never guessed (`docs/MEDICAL_ACCURACY.md`).
- **Stroke case (Tabeen).** ATLAS v2.0 not yet downloaded. It reuses the
  lesion-overlay renderer, so once the MNI-normalized data is in hand it is a
  preprocessing + fixture task, no new frontend work.
- **Alzheimer's case (Tabeen).** OASIS-1 on disk is cross-sectional GM/WM
  probability maps (`mwrc1`/`mwrc2`), not a same-patient `baseline`/`followup`
  pair. An honest build is a cross-subject CDR 0 vs CDR ≥ 1 comparison, labelled
  as cross-sectional (not longitudinal), using the CDR metadata from the nilearn
  OASIS fetcher. Not built yet.
- **Region / disorder descriptions (neuro review).** All prose is `NEEDS_SOURCE`.
  A human sources cited text and fills `*_source`; code never writes anatomy.
- **Mesh polish (Tabeen, optional).** Subcortical glb currently includes
  ventricles / corpus callosum / white matter. Consider a grey-matter-only
  subcortical set and Draco compression for a lighter download.

### Risks

- **DUA / redistribution.** BraTS / OASIS / CHB-MIT data-use agreements commonly
  forbid redistributing patient-derived scans. Keep `assets/cases/**` out of git
  and off any public deployment. If the GitHub repo is public, the ignored assets
  must stay ignored; the committed atlas glbs are CC-licensed and safe.
- **Mesh performance.** Real meshes were ~190k verts/hemisphere; decimation
  brought the atlas down, but validate smoothness on a laptop and phone before
  the demo. Draco is the next lever if needed.
- **Medical honesty gates.** Two claims must never blur: computed per-case mask
  overlaps (strong) vs. literature-level typical patterns (cited). The frontend
  must style them differently and never render `NEEDS_SOURCE` as blank or as
  invented text. Epilepsy is scalp-level, not a localized focus.
- **CI vs. assets.** The validator's asset-existence check is `--check-assets`
  (local only), because assets are git-ignored. CI validates structure and ids.
  A developer must run `--check-assets` locally after building.

### Next steps

- Abdul: build step 1 (R3F atlas explorer) against `regions.json` +
  `brain-*.glb`, and the three renderers against the two real cases. The
  `eeg` and `lesion-overlay` paths have real data now.
- Tabeen: review the shared shapes, then land the tumor overlap pipeline and the
  stroke + Alzheimer's cases into the same shapes (the frontend will not change).
