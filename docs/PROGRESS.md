# Progress and handoff (shared)

A running log both developers read. Newest entry on top. It records what has
landed, what is deferred and who owns it, and the risks to keep in view. It is
not a spec (the specs are `docs/DATA_CONTRACT.md` and `docs/MEDICAL_ACCURACY.md`);
it is the shared state of the build.

## 2026-07-22 Frontend session 6: honesty and robustness hardening

Branch: `fe/atlas-visual-fidelity`. Owner: Abdul Mannan. A non-backend-dependent
increment that locks in the medical-honesty rules with automated coverage and
closes one silent-failure gap in the evidence viewer. Typecheck, lint, the new
unit suite (31 tests), and the e2e suite (14) are all green.

### What landed

- **Unit-test tooling (Vitest).** There was no unit runner before — only
  Playwright e2e. Added `vitest` (dev-only), `vitest.config.ts` (node env, pure
  logic only, `@` alias), and `npm test` / `npm run test:watch` scripts. The
  React / Niivue / R3F surfaces stay covered by e2e; this suite covers the pure
  logic that e2e can only exercise indirectly.
- **Tests for the three honesty choke points** (`src/lib/contract/*.test.ts`, 31
  tests): `review.ts` (resolveSourced treats NEEDS_SOURCE / null / empty /
  whitespace as pending and never leaks a citation onto a placeholder;
  evidenceStrength distinguishes computed-from-mask vs cited-pattern;
  hasUnreviewedContent; formatOverlapFraction thresholds), `links.ts`
  (getRegionLinks only ever emits cited typical-patterns, one per match, and
  derives `hasDemo` / first `caseId` honestly), and `load.ts` (the boundary
  validators throw loudly — naming index and missing field — on a non-array
  payload, an incomplete record, a non-ok HTTP status, or a malformed case /
  waveform, with `fetch` mocked). These pin the "never blank, never invented,
  computed vs cited never blur" contract so a regression fails a test, not a
  reviewer.
- **EEG spectrogram missing-asset state.** The spectrogram `<img>` had no error
  handling, so a missing PNG rendered as a broken-image glyph — the "empty but
  fine" failure every neighbouring loader (Niivue volumes, the waveform JSON)
  already guards against. It now has an `onError` that shows the same honest
  "could not be loaded" surface, url-tagged so a stale failure clears when the
  case changes.

### Notes

- One test surfaced that `formatOverlapFraction(0)` renders `"0.00%"` (exact zero
  falls under the sub-1% two-decimal branch). Left as-is — a 0% overlap does not
  occur for a real region mapping — and documented in the test rather than
  changing the display function.
- Pre-existing `npm audit` findings (postcss / sharp) come from Next's own
  transitive deps; their only "fix" downgrades Next to 9.3.3, so they are not
  actioned here and were not introduced by the Vitest install.

## 2026-07-22 Frontend session 5: two-step narrative polish

Branch: `fe/atlas-visual-fidelity`. Owner: Abdul Mannan. With the substantive
step-2 features now data-blocked on the backend (real `region_mappings`, stroke
/ Alzheimer's cases, detailing meshes), this session hardened the *narrative* of
the two-step UX — orientation and traceability framing — without inventing any
medical content. Typecheck, lint, and the e2e suite (now 14, +3) are green;
verified in a real browser in both themes.

### What landed

- **"About this demo" orientation dialog** (`chrome/AboutDialog.tsx`). States the
  two-step method and, crucially, how to read the evidence: the four reserved
  hues (selection / computed / cited / pending) as a legend, since that colour
  language is the only way a reviewer tells a segmented finding from a
  literature-level pattern from an unsourced placeholder. It authors no anatomy —
  method and posture only — and reports what is wired straight from the loaded
  disorders ("N of 4 disorders have a wired demo case"), listing the unwired ones
  greyed rather than hiding the gap. Accessible: `role="dialog"`, `aria-modal`,
  focus moved in on open and trapped, Esc + backdrop close, focus returned to the
  opener.
- **First-run + persistent access.** Auto-opens once per reviewer (`lib/intro.ts`,
  localStorage `braintwin.intro.seen`, read post-mount to avoid a hydration
  mismatch), reopenable anytime from an app-bar "About" (ⓘ) button in both modes.
- **Legible step-2 entry.** The corner "Evidence →" became a self-explaining CTA
  that names the payoff and the count ("Evidence · 2 studies →"), so the second
  half of the demo is discoverable rather than a bare label.
- **Region → evidence bridge.** From the region panel: a working "Browse disorder
  studies →" in the honest empty state (today's real case, since
  `typical_affected_regions` is empty), plus an actionable "demo →" chip on any
  cited link that jumps straight into that disorder's case. `links.ts` now carries
  the first `caseId` so the jump is data-driven. Both light up the moment cited
  patterns land — no code change needed.

### Notes

- Nothing new is asserted about anatomy or involvement. The dialog reinforces the
  pending-review posture rather than bypassing it, and the honesty-critical claim
  types keep the same styling and language they have elsewhere.
- No backend handoff added or changed. The data-blocked items from session 4
  (tumour `region_mappings`, stroke / Alzheimer's cases, detailing meshes) still
  stand exactly as logged there.

## 2026-07-22 Frontend session 4: step-2 evidence viewer (Niivue + EEG)

Branch: `fe/atlas-visual-fidelity`. Owner: Abdul Mannan. Built step 2, the
evidence viewer, so the two-step UX is now end to end: explore the normal brain,
then switch into a disorder's de-identified case and inspect the evidence behind
it. Typecheck, lint, and the e2e suite (now 11 tests, +3 for step 2) are green.

### What landed

- Mode switch, one WebGL context at a time. The store gained an
  `atlas` / `evidence` mode; the atlas R3F canvas unmounts before the evidence
  view mounts, so the two contexts never coexist. The whole evidence subtree
  (which pulls in Niivue) is `next/dynamic` + `ssr:false`, keeping Niivue out of
  the atlas chunk and the server bundle. Entered via an `Evidence` app-bar button
  (shown only when a disorder has a wired case), left via `Atlas`.
- Renderer chosen from data, not disorder. `EvidenceView` switches on
  `evidence.renderer` (`lesion-overlay` / `atrophy-pair` / `eeg`) with an
  exhaustive `never` check — adding a disorder adds data, never a branch.
- `lesion-overlay` (tumour, stroke): Niivue multiplanar, grayscale base with the
  mask overlaid; the mask legend is the case's `mask_labels`, verbatim, with no
  invented value→colour mapping. `NiivueMount` owns the sole second GL context
  and releases it on unmount (this Niivue build has no `destroy`).
- `eeg` (epilepsy): the precomputed spectrogram PNG plus the raw scalp traces
  drawn from `waveform.json` on a 2D canvas (no client-side signal processing).
  Framed on screen as scalp-level and approximate; nothing is drawn on the brain
  as a seizure focus.
- `atrophy-pair` (Alzheimer's): baseline beside follow-up, each its own Niivue
  surface. Renderer is wired; no case data exists yet, so it is unreached.
- Traceability, honestly typed. `RegionMappings` styles computed involvement
  (this patient's mask ∩ atlas, with an overlap metric) differently from cited
  typical / scalp-level patterns. An empty `region_mappings` (the tumour case
  today) renders "Region involvement not yet computed" — never no-involvement,
  never a guessed region. Report summaries pass through `SourcedField`, so an
  unsourced summary shows the pending placeholder, never the raw marker.
- Study picker. `DisorderList` lists every disorder; only those with a wired demo
  case are selectable, the rest shown disabled and labelled, so the demo is
  honest about which evidence actually exists. Cases are fetched on demand.

### Backend handoff (Tabeen)

- **Tumor `region_mappings`.** The step-2 tumour view is complete but shows
  "involvement not yet computed" because `brats-001.region_mappings` is empty.
  Populating it is the backend BraTS-mask ∩ DK-atlas overlap pipeline; the shape
  is `RegionMapping[]` with `overlap_metric` set (that is what renders as the
  `computed` claim type). No frontend change needed when it lands.
- **Stroke / Alzheimer's cases.** Both renderers exist (`lesion-overlay`,
  `atrophy-pair`). Adding a case JSON + assets for either makes it appear in the
  study list automatically — no code branch.

## 2026-07-22 Frontend session 3: tissue realism, themes, instrument layout

Branch: `fe/atlas-visual-fidelity`. Owner: Abdul Mannan. A visual-fidelity and
usability pass on step 1, driven by session-2 feedback: the cortex was not rich
enough, the brain read as a hollow shell, dissected regions blocked picking, and
the layout looked generic with no light theme and no small-screen handling.
Verified in a real browser at desktop and phone widths, both themes; typecheck,
lint, and the e2e suite (now 8 tests) are green.

### What landed

- Richer tissue and a solid brain. Cortex base is a warmer rose (`#d9948c`) with
  higher roughness plus faint clearcoat and sheen; subcortical is a cooler slate.
  Meshes now render `THREE.DoubleSide`, so the surface no longer reads as an
  empty shell when the camera sees an inner face.
- Pick-through on removed surfaces. Ghosted cortex and dissected/removed meshes
  swap their `raycast` to a no-op, so a click passes through to the structure
  behind them instead of being caught by an invisible surface. Still a material
  and per-mesh-flag change only, no geometry rebuild.
- Region-colour mode. A new toggle gives every region its own deterministic hue
  (`lib/atlas/regionColor.ts`, FNV-1a hash to HSL) for easy differentiation. It
  is a purely visual aid: it asserts nothing clinical and deliberately avoids the
  four reserved involvement hues (cyan select, rose primary, violet secondary,
  amber pending).
- Two-theme surface. Clinical light is now the default imaging-workstation look;
  clinical dark is the alternate reading-room surface. Themes are token overrides
  on `<html data-theme>`; a no-FOUC head script sets it before paint from
  localStorage, and the store reconciles to localStorage on mount (React
  hydration can drop the script-set attribute). Theme toggle lives in the app-bar
  and the 3D light rig is theme-aware.
- De-generic instrument layout. A slim top app-bar (brain mark, wordmark,
  `Atlas explorer` ident, pending-review chip, theme toggle) replaces the old
  floating identity card; on-stage tools (layers, views) still float over the
  canvas. The review banner is slimmer but still persistent (`role="status"`,
  "Pending expert review.").
- Responsive. Docked rails stay for wide screens (index hidden below `lg`, detail
  below `md`). Below those widths the app-bar shows `Regions` / `Detail` triggers
  that open the same content as slide-over drawers (`role="dialog"`, no landmark
  collision with the docked rails). On-stage tool clusters stack and scroll
  instead of overlapping on narrow screens.

### Backend handoff (Tabeen, for the first backend session)

- **Detailing meshes (veins, arteries, nerves).** The frontend is already wired:
  the three toggles exist but render disabled ("soon") until an aligned glb is
  present. Producing them is a backend task: export from a source such as
  Z-Anatomy / BodyParts3D `.blend`, align into the same MNI space as the atlas
  glbs, and drop the result into `frontend/public/assets/detailing/`. When those
  land, the frontend removes the `pending` flag on those layers; no new wiring.
- **Tumor `region_mappings`** stays as previously logged (BraTS mask ∩ DK atlas
  overlap pipeline). Until it is computed the step-2 tumor view will show
  "involvement not yet computed", never a guessed region.



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
