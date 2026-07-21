# Progress and handoff (shared)

A running log both developers read. Newest entry on top. It records what has
landed, what is deferred and who owns it, and the risks to keep in view. It is
not a spec (the specs are `docs/DATA_CONTRACT.md` and `docs/MEDICAL_ACCURACY.md`);
it is the shared state of the build.

## 2026-07-21 Frontend session 2: visual overhaul, dissection, anatomical views

Branch: `fe/atlas-explorer`. Owner: Abdul Mannan. A visual-quality and
interaction pass on step 1, driven by two reference images and direct feedback
that the old dark/desaturated look had poor contrast and lighting. Verified in a
real browser; typecheck, lint, and the e2e suite (now 6 tests) are green.

### What landed

- Reworked the design tokens: lifted the whole surface ramp off pure black to a
  graphite `#0d1117` base, raised text contrast, and added a soft radial CSS
  "stage" gradient behind a now-transparent WebGL canvas so the brain sits in a
  pool of light instead of on flat black.
- Rebuilt the 3D look: a studio three-point light rig (warm key, cool fill, cool
  back-rim) and a `MeshPhysicalMaterial` with faint clearcoat + sheen, so the
  cortex reads as living tissue. Warm grey-pink cortex over cooler deep grey.
- Dissection: `Isolate` (view only this region, hide the rest) and `Hide`
  (peel a region away), both from the region panel, plus a `DissectionBar` that
  names the current cut and offers a single "Reset model" so no one gets stranded
  in a partial view. Visibility is a per-mesh flag applied through the existing
  imperative store subscription — no geometry rebuild, no context teardown.
- Anatomical view presets (`Sagittal`, `Coronal`, `Axial`, `3/4`) with a smooth
  eased camera tween, plus a `Focus selected` modifier: off frames the whole
  brain centred; on brings the selected region to the front (the sagittal-style
  close-up the reference showed). Both requested spacings are now explicit modes.
- Layer controls now split Brain (Cortex, Subcortical, Ghost cortex) from
  Detailing (Veins, Arteries, Nerves). The detailing layers are wired but render
  as disabled "soon" toggles until their meshes are sourced — honest about what
  is and is not in the model.
- Region panel redesigned toward the Neurotorium reference: region name +
  isolate/hide actions, the sourced "Normal function" placeholder, a new
  `Linked disorders` section, and the atlas meta rows.

### Medical-honesty notes (please review)

- The `Linked disorders` section and the region descriptions are the honest,
  data-driven versions, not the rich prose in the reference screenshot. Region
  `normal_function_description` is still `NEEDS_SOURCE` for all 100 regions, so it
  renders as the pending placeholder. Links come only from a disorder's
  `typical_affected_regions` (cited typical patterns), which are currently empty,
  so every region truthfully shows "no cited pattern references this region yet".
  The mechanism is real and lights up the moment cited data lands; nothing is
  invented to fill the reference's look. This is per `docs/MEDICAL_ACCURACY.md`.
- Per-case computed involvement (tumour/stroke mask ∩ region) is deliberately NOT
  asserted from the atlas panel; it belongs to the step-2 evidence view. The
  panel copy says so.

### Detailing assets (veins/arteries/nerves) — sourcing handoff

The reference vessels are from Visible Body (proprietary), so they can't be
reused. Added `docs/ASSET_SOURCING.md` (vetted free sources: Z-Anatomy CC-BY-SA,
BodyParts3D, NIH 3D, with the MNI-alignment caveat) and a resumable
`backend/download_detailing_assets.sh` (`curl -C -` / shallow git clone). The
frontend layers are ready; wiring a mesh in is a one-line change (drop the
`pending` prop) once a glb is aligned to the atlas frame.

### New files

`components/atlas/ViewControls.tsx`, `components/atlas/DissectionBar.tsx`,
`components/panel/RegionLinks.tsx`, `lib/contract/links.ts`,
`docs/ASSET_SOURCING.md`, `backend/download_detailing_assets.sh`.

### Next session (frontend)

Step 2 is still the big one: disorder/case selectors, role-coloured grouped
highlighting from `region_mappings`, and the lazy Niivue evidence viewer. The
`Linked disorders` section gives step 2 a natural entry point from a region.

## 2026-07-21 Frontend session 1: Next.js scaffold and step 1 atlas explorer

Branch: `fe/atlas-explorer`. Owner: Abdul Mannan. Step 1 of the two-step UX is
working end to end against the real wired dataset. Verified in a real browser,
not just compiled.

### What landed

- Next.js 16 app in `/frontend` (App Router, TypeScript, Tailwind v4, Turbopack)
  with React Three Fiber 9, drei 10, three 0.185, and zustand.
- `src/lib/contract/` is the typed frontend half of the contract: `types.ts`
  mirrors every shape in `docs/DATA_CONTRACT.md`, `load.ts` fetches and validates
  the JSON at the boundary, `review.ts` is the single choke point for the
  medical-honesty rules.
- Step 1 atlas explorer: both atlas glbs load, all 100 mesh nodes join to
  `regions.json`, regions are clickable by raycast, and the detail panel shows
  the region record.
- Searchable region index for all 100 regions, because subcortical structures
  cannot be reached by clicking the cortex.
- Ghost cortex control that fades the cortical surface so subcortical structures
  can be seen and picked through it.
- Persistent "pending expert review" banner with a live unreviewed count, and a
  `SourcedField` component that is the only sanctioned way to render a contract
  text field. It renders `NEEDS_SOURCE` as a visible amber placeholder.
- Playwright e2e smoke suite (`npm run test:e2e`, 4 tests, passing) covering the
  mesh-to-catalog join, the banner, the placeholder rule, and the ghost toggle.

### Verified, not assumed

- All 68 cortical plus 32 subcortical glb node names join to `regions.json` both
  ways, with no orphans. A mismatch logs a `[contract]` console error and fails
  an e2e test.
- The literal string `NEEDS_SOURCE` never reaches the screen. Asserted in e2e.
- Clicking `Left precentral` highlights the precentral gyrus in anatomically the
  right place, which confirms the mesh, the catalog, and the coordinate
  transform all agree.

### Decisions taken, please review

1. **Coordinate transform.** Both glbs are in raw MNI (x right, y anterior,
   z superior) with no baked node transform. The atlas is rotated -90 degrees
   about X to reach three.js y-up. Both layers share one centering offset
   (the cortical bounding box centre, MNI -0.45, -14.85, 0.7). Centering them
   independently would silently pull the subcortical structures out of register
   with the cortex, so this must stay a single shared transform.
2. **Client-side data loading.** `regions.json` is fetched in the browser rather
   than server-rendered, so the app stays a pure static-asset consumer with no
   runtime backend, matching `docs/ARCHITECTURE.md`.
3. **Playwright added as a dev dependency.** It is the E2E framework the repo
   standards already name, and it is the only way to verify WebGL output. In CI
   it needs Chromium on SwiftShader, which is slow, hence the generous timeouts
   in `playwright.config.ts`.

### Contract gaps found (Tabeen, please confirm)

- **`waveform.json` shape is undocumented.** `docs/DATA_CONTRACT.md` names the
  file path but never specifies its contents. The emitted file has
  `sampling_rate_hz`, `window`, `onset_s`, `duration_s`, `units`,
  `involved_channels`, and `channels[{name, values}]`. It is typed in
  `frontend/src/lib/contract/types.ts` from the real file and carries a
  `TODO(contract)` marker. This needs a `contract/*` PR to become an agreed
  shape rather than an observed one, before the eeg renderer is built.
- **Glioma has no `region_mappings`.** Step 2 for the tumor case will highlight
  zero regions until the overlap pipeline lands. The frontend will show an
  explicit "involvement not yet computed" state rather than an empty brain that
  reads as "no regions affected". Flagging so the demo narrative accounts for it.

### Note on the design skill

Root `CLAUDE.md` requires the `frontend-design` skill for UI work. That exact
skill is not installed in this environment. `ecc:frontend-design-direction` was
used instead and the direction is recorded in the token block at the top of
`src/app/globals.css`. Worth installing the canonical skill from
`anthropics/skills` so both developers work from the same guidance.

### Next session (frontend)

Step 2: disorder and case selectors from `disorders.json`, role-coloured
grouped highlighting driven by `region_mappings`, and the lazy-loaded Niivue
evidence viewer starting with `lesion-overlay`. The one-WebGL-context-at-a-time
rule is already set up for this, since the R3F canvas is dynamically imported
and can be unmounted when Niivue mounts.

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
