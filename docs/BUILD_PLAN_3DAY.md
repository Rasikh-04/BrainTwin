# Three-day build plan

The plan is shaped around one fact: gated data access is the critical path, so registrations start before any code. Two parallel tracks after the contract lands. A clear fallback so the demo is never blocked on a single dataset.

## Hour zero, before code (both, together, 30 to 60 minutes)

- Start every gated registration now: BraTS on Synapse, ATLAS v2.0 on NITRC or ICPSR, and the OASIS Data Use Agreement. The OASIS invite can take up to a week, so its clock has to start first.
- Download the two certain-fast datasets in parallel: CHB-MIT from PhysioNet (open) and a BraTS Kaggle mirror (minutes) to build against immediately.
- Agree the third-disorder call is stroke (ATLAS), keep Alzheimer's as the neuro pillar with the understanding it may arrive after review.

## Day 1

Contract first, then both tracks split.

Together, first thing: Tabeen lands the contract pull request, schema plus fixtures plus small sample assets, so Mannan is unblocked from hour one. Nothing else on day 1 matters more than this landing.

Tabeen (data):
- Export the atlas meshes to the contract glbs. Fastest route is the Brainder pre-partitioned CC meshes converted to glb; the fsaverage plus aparc export is the alternative. Get `brain-cortical.glb` and `brain-subcortical.glb` with node names equal to `region_id`, and the matching `regions.json` skeleton with `NEEDS_SOURCE` descriptions.
- Build the tumor pipeline against the Kaggle BraTS subset: pick five to ten cases, place the base and mask NIfTI, compute mask-to-atlas region overlap, emit the case JSON with real `region_mappings` and provenance.

Mannan (frontend):
- Next.js app skeleton. Load the atlas glb in R3F, rotate, raycast to a region node, highlight by material swap, side panel showing the region fields from `regions.json`. This is step 1, built entirely against the fixture glb and fixture `regions.json`.
- Invoke the frontend-design skill and set the visual direction here. Step 1 polish is what makes the whole thing feel real.

## Day 2

Tabeen (data):
- Epilepsy pipeline from CHB-MIT: pick cases with clear annotated seizures, extract the window around onset, render the spectrogram PNG and the downsampled waveform JSON, record onset seconds, duration, and involved channels, emit the case JSON labeled as scalp-channel-level.
- Stroke pipeline from ATLAS as soon as access clears: same shape as tumor because it reuses the lesion-overlay renderer. Base plus mask NIfTI in MNI, compute region overlap, emit case JSON.

Mannan (frontend):
- Step 2. Disorder and case selectors driven by `disorders.json` and `cases/*.json`. Re-render the atlas with affected regions highlighted, color-coded by role, grouped when several are involved but still clickable.
- Wire the Niivue evidence viewer, lazy-loaded, for the `lesion-overlay` renderer first (tumor, then stroke for free). Enforce the one-context-at-a-time rule: pause or unmount R3F when Niivue is up.

## Day 3

Tabeen (data):
- Alzheimer's if OASIS access has cleared: assemble the CDR 0 versus CDR 1 or 2 scan pair, emit the `atrophy-pair` case JSON with the cited typical-region pattern. If OASIS has not cleared, this slips to post-review and is not a day-3 blocker.
- Fill provenance and `overlap_metric` on every mapping, run the contract validator, fix anything red.

Mannan (frontend):
- The remaining two evidence renderers: `atrophy-pair` (scan pair in Niivue) and `eeg` (spectrogram plus waveform display). The `eeg` and `atrophy` views are display-only of precomputed assets, so they are quick once the lesion-overlay path exists.
- The persistent "pending expert review" banner and per-record review status. Final polish pass with the frontend-design skill.

Together, end of day 3:
- Pick the three to five strongest cases per disorder, script the demo narrative, run the validator clean, and confirm no `NEEDS_SOURCE` field is being rendered as if it were real content.

## Fallback ordering

If the three days get tight, cut in this order and the demo stays credible:

1. Drop stroke. It reuses the tumor renderer, so its absence costs the least; you still have structural (tumor), functional (epilepsy), and neuro (Alzheimer's).
2. Drop Alzheimer's if OASIS access never cleared. You still have structural plus functional, tumor plus epilepsy, which is the minimum viable proof of all three POC claims.

The floor is tumor plus epilepsy: two distinct evidence renderers, both from fast-access data, both fully grounded. Everything above that is upside.

## Definition of done for the POC

- Step 1 works: rotate, click any region, see its cited or placeholder description and atlas source.
- Step 2 works for at least tumor and epilepsy: select a disorder or case, see grounded highlighted regions, click through to the real evidence.
- Every highlighted region traces to a computation or a citation. No invented mappings, no invented prose rendered as fact.
- Contract validator passes. "Pending expert review" banner present. Ready to hand to a neurologist.
