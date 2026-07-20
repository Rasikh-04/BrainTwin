# CLAUDE.md (frontend, Abdul Mannan's domain)

Scope: this directory is the Next.js app. Two visual layers, the React Three Fiber atlas explorer (step 1) and the Niivue evidence viewer (step 2), driven entirely by the contract JSON and assets. Read the root `CLAUDE.md`, `docs/DATA_CONTRACT.md`, `docs/ARCHITECTURE.md`, and `docs/MEDICAL_ACCURACY.md` before writing components. This side never reaches into `/backend`; it consumes `/contract` and `/public`.

## Use the frontend-design skill

For any component, layout, or styling work, invoke the `frontend-design` skill first and follow its design-token and styling guidance. UI quality is a graded part of this POC. Step 1 in particular is where the polish lands, because a normal-brain explorer that feels accurate and smooth is what makes the disorder overlays credible. Do not ship default-looking UI.

## The data you consume

- `/public/data/regions.json`, `/public/data/disorders.json`, `/public/data/cases/<case_id>.json`.
- `/public/assets/atlas/brain-cortical.glb` and `brain-subcortical.glb`, node names equal `region_id`.
- Case assets: NIfTI base and mask, or the atrophy pair, or the spectrogram PNG and waveform JSON.

Build against `/contract/fixtures` from hour one. Do not wait for the real pipeline. When real data lands it is the same shapes, so your code does not change.

## Rendering rules (these are the "no lag" requirement, not suggestions)

- Two WebGL contexts, one at a time. The R3F canvas and the Niivue canvas never render simultaneously. Pause or unmount the R3F canvas when entering an evidence view; tear down or hide Niivue when returning to the atlas.
- Lazy-load Niivue. Code-split it and import it only when an evidence view opens. It is heavy.
- Highlight by material swap on the picked node. Do not rebuild geometry, do not re-upload buffers, do not recolor per vertex on the CPU per frame. Raycast to the node whose name is the `region_id`, swap its material, done.
- Grouping multiple involved regions: shared material or emissive tint plus an optional outline, driven by uniforms, not by geometry changes. Keep them individually clickable.
- Load progressively. Paint the atlas as soon as the glb is ready. Fetch case JSON and case assets on demand when a disorder or case is selected. Do not block first paint on all cases.
- Expect a Draco-compressed glb at fsaverage6 resolution or lower. Set up the Draco loader.

## Rendering step 2 by renderer, not by disorder

The frontend never hardcodes per-disorder logic. It switches on `evidence_renderer` (`lesion-overlay`, `atrophy-pair`, `eeg`) and nothing else. Add a disorder by adding its data, not by adding a code branch. The three renderers:

- `lesion-overlay`: Niivue loads `base.nii.gz` and overlays `mask.nii.gz` with the `mask_labels` legend. Serves tumor and stroke.
- `atrophy-pair`: Niivue shows `baseline.nii.gz` and `followup.nii.gz` side by side or toggled. Serves Alzheimer's.
- `eeg`: display the precomputed `spectrogram.png` and render `waveform.json`. No client-side signal processing. Serves epilepsy.

## Medical content rules that bind the UI

- Render a `NEEDS_SOURCE` field as a visible "pending expert review" placeholder. Never render it blank, and never substitute your own text.
- Show the "pending expert review" banner persistently while any record is unreviewed. Reflect per-record review status.
- Style the two claim types differently so a reviewer can tell them apart: per-case computed mappings (with an overlap metric) versus literature-level typical patterns (with a citation). Do not present a typical pattern as if it were segmented from the patient.
- For epilepsy, label channel involvement as scalp-level and approximate. Do not draw a confident single-region seizure focus on the brain.

## Contract discipline

If you find yourself wanting a field the contract does not have, that is a `contract/*` pull request reviewed by Tabeen, not an assumption baked into a component. Keep consuming the shapes as specified; when they change, they change in `/contract` first.
