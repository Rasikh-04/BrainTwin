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

The validator (to be written as `validate.py` or a node script, either is fine) checks: mesh node names match `regions.json` both ways, every `case.disorder_id` exists, every mapped `region_id` exists, every referenced asset path exists, and no field holds invented content where a `NEEDS_SOURCE` marker belongs. CI runs it on every pull request; red blocks merge.

Change process: a change to any shape here is a `contract/*` pull request reviewed by both developers, because both sides depend on it.
