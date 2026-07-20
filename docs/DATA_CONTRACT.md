# Data contract (the common wiring)

This is the single interface between the two halves of the project. Everything Tabeen's preprocessing emits and everything Mannan's frontend consumes is defined here. It lives in `/contract` as JSON Schema plus example fixtures. It is the first thing to land in the repo, before either side builds, so both can work in parallel against fixtures.

## Why static JSON instead of a live database for the POC

Everything data-related is precomputed. So the POC ships its content as versioned static JSON files plus asset files, not as a running API. That choice does two things: it removes the backend as a runtime dependency for the frontend (the frontend just fetches JSON and asset URLs), and it makes the contract a set of files both people can see and diff. The relational Postgres schema from the blueprint is still documented in `docs/ARCHITECTURE.md` as the production target, and the JSON shapes below map one to one onto those tables, so nothing is thrown away later.

Concretely, the frontend reads:

- `/public/data/regions.json` the atlas region catalog
- `/public/data/disorders.json` the disorder catalog
- `/public/data/cases/<case_id>.json` one file per de-identified case
- `/public/assets/...` the mesh, NIfTI, spectrogram, and waveform files

## Asset naming spec

Deterministic names so the two sides never have to coordinate on a URL. All lowercase, hyphen-separated, no spaces.

- Atlas mesh: `/public/assets/atlas/brain-cortical.glb` and `/public/assets/atlas/brain-subcortical.glb`
- Case imaging (NIfTI): `/public/assets/cases/<case_id>/base.nii.gz` (the anatomical scan) and `/public/assets/cases/<case_id>/mask.nii.gz` (the lesion or segmentation overlay)
- Alzheimer's scan pair: `/public/assets/cases/<case_id>/baseline.nii.gz` and `/public/assets/cases/<case_id>/followup.nii.gz`
- EEG evidence: `/public/assets/cases/<case_id>/spectrogram.png` and `/public/assets/cases/<case_id>/waveform.json`

`case_id` format: `<dataset>-<n>`, for example `brats-001`, `atlas-004`, `chbmit-01`, `oasis-014`. Never a real patient identifier.

## Region shape

The atlas mesh and this catalog are joined on `region_id`, which must equal the node name inside the glb (see the mesh contract below).

```json
{
  "region_id": "ctx-lh-superiorfrontal",
  "name": "Left superior frontal gyrus",
  "atlas_source": "desikan-killiany",
  "hemisphere": "left",
  "structure_type": "cortical",
  "centroid_mni": [-12.4, 34.1, 48.9],
  "normal_function_description": "NEEDS_SOURCE",
  "description_source": null,
  "review_status": "pending"
}
```

Rules: `atlas_source` is one of `desikan-killiany`, `aseg`, `aal`. `structure_type` is `cortical` or `subcortical`. `normal_function_description` stays as the literal string `NEEDS_SOURCE` until a cited description is added, at which point `description_source` must be filled. The frontend must render a `NEEDS_SOURCE` region description as a visible "pending" placeholder, never as blank and never with invented text.

## Disorder shape

```json
{
  "disorder_id": "glioma",
  "name": "Glioma (brain tumor)",
  "category": "structural",
  "evidence_renderer": "lesion-overlay",
  "description": "NEEDS_SOURCE",
  "description_source": null,
  "typical_affected_regions": [],
  "case_ids": ["brats-001", "brats-002"],
  "review_status": "pending"
}
```

Rules: `evidence_renderer` is one of `lesion-overlay`, `atrophy-pair`, `eeg`. This is the only switch the frontend uses to decide how to render step 2, so the frontend never hardcodes per-disorder rendering logic. `typical_affected_regions` is for literature-level patterns only (Alzheimer's, epilepsy) and each entry must carry a citation; for tumor and stroke this stays empty because involvement is per case and computed, not typical.

`typical_affected_regions` entry shape when used:

```json
{ "region_id": "aseg-left-hippocampus", "source": "PMID:XXXXXXX", "note": "typical early atrophy in AD" }
```

## Case shape

The heart of traceability. One file per de-identified case. `region_mappings` is what drives the highlight in step 2.

```json
{
  "case_id": "brats-001",
  "disorder_id": "glioma",
  "source_dataset": "BraTS",
  "anonymized_meta": { "age_band": "40-49", "sex": "F" },
  "report_summary": "NEEDS_SOURCE",
  "evidence": {
    "renderer": "lesion-overlay",
    "base": "/assets/cases/brats-001/base.nii.gz",
    "mask": "/assets/cases/brats-001/mask.nii.gz",
    "mask_labels": { "1": "necrotic core", "2": "edema", "4": "enhancing tumor" }
  },
  "region_mappings": [
    {
      "region_id": "ctx-lh-superiortemporal",
      "role": "primary",
      "evidence_type": "segmentation_mask",
      "overlap_metric": { "overlap_voxels": 812, "overlap_fraction_of_region": 0.19 },
      "provenance": "computed: mask.nii.gz intersect DK atlas in MNI space",
      "notes": ""
    }
  ],
  "review_status": "pending"
}
```

Rules:

- `evidence.renderer` must match the disorder's `evidence_renderer`.
- For `lesion-overlay` cases, every `region_mappings` entry must have `evidence_type: "segmentation_mask"` and a real `overlap_metric` and `provenance`. These are computed by the backend, never assigned by hand or by the model.
- For `atrophy-pair` cases, `evidence` carries `baseline` and `followup` paths instead of `base` and `mask`, and mappings use `evidence_type: "atrophy"` with the CDR rating and the citation for the atrophy pattern in `provenance`.
- For `eeg` cases, `evidence` carries `spectrogram`, `waveform`, `onset_seconds`, `duration_seconds`, and `involved_channels`. Mappings use `evidence_type: "eeg"` and must be labeled as scalp-channel-level, not precise brain foci (see the scalp EEG caveat in `docs/MEDICAL_ACCURACY.md`).
- `role` is `primary` or `secondary`. The frontend color-codes by role.
- No field is ever populated with a fabricated value to make the file look complete. Missing means `NEEDS_SOURCE` or an empty array.

## Mesh contract

The single most load-bearing agreement for step 1.

- The cortical atlas ships as one glb: `brain-cortical.glb`. Each Desikan-Killiany region is a separately named node or primitive whose name equals its `region_id` (for example `ctx-lh-superiorfrontal`). This lets the frontend raycast to a node and highlight by swapping that node's material, with no per-vertex CPU work at runtime.
- Subcortical structures ship as one glb: `brain-subcortical.glb`, same naming rule, `region_id` values from the aseg atlas (for example `aseg-left-hippocampus`).
- Mesh resolution: use fsaverage6 or lower (about 40k vertices per hemisphere or less) so it stays smooth on a laptop and a phone. Draco-compress the glb.
- Coordinate space: MNI, so that lesion masks (also placed in MNI space by the backend) line up conceptually with the same atlas. The frontend does not overlay masks on the atlas mesh directly in the POC; masks are shown in the Niivue evidence viewer. But keeping both in MNI keeps the story coherent and keeps the door open.

The region catalog `regions.json` and the mesh node names are joined on `region_id`. If a node name has no matching catalog entry, that is a contract violation and should fail a validation check, not be silently ignored.

## Contract validation

`/contract` includes a small validator (`validate.py` or a node script, either is fine) that checks: every mesh node name has a `regions.json` entry and vice versa, every `case.disorder_id` exists in `disorders.json`, every `region_mappings.region_id` exists in `regions.json`, every asset path referenced actually exists, and no field contains invented content where a `NEEDS_SOURCE` marker belongs. Run it in CI on every pull request. A red validator blocks merge.

## Fixtures come first

Before real data exists, Tabeen commits realistic fixtures under `/contract/fixtures`: one `regions.json` with a handful of real DK region names, one `disorders.json` with all four disorders, one case per renderer type, a tiny placeholder `brain-cortical.glb` (even a low-poly stand-in), a small sample `base.nii.gz` and `mask.nii.gz`, a sample `spectrogram.png`, and a sample `waveform.json`. Mannan builds the entire frontend against these fixtures and never has to wait for the real pipeline. When real data lands, it drops into the same shapes and the frontend does not change.
