# CLAUDE.md (repo root)

This file is read automatically by Claude Code at the start of every session in this repo. It is the shared contract for both developers. Read it fully before writing any code. When a task touches medical or anatomical content, also read `docs/MEDICAL_ACCURACY.md` before doing anything.

## What we are building

A web-first proof of concept for a "brain digital twin": explore a normal brain by region, then switch into a disorder or a specific de-identified case and see exactly which regions changed, with every highlighted region traceable back to the real scan, EEG, or report it came from.

The POC has to prove three things and nothing more:

1. Mapping is real, not decorative. Affected regions come from an actual anatomical atlas and actual patient data, never from a guess about where a disorder "should" appear.
2. The two-step interaction works. Explore a normal brain by region, then switch into a disorder or case and see the grouped, highlighted changes.
3. Evidence is traceable. Every highlighted region links back to the real file it came from, so a reviewer can verify the claim.

Explicitly out of scope for this phase: real-time segmentation, live patient ingestion, treatment simulation, DICOM pipelines, and desktop or mobile packaging. Those are the production system. See `docs/ARCHITECTURE.md` section "What changes for production".

## The disorders in this POC

Four disorders across three evidence renderers. See `docs/DATA_SOURCES.md` for the exact datasets, licenses, and download steps.

| Disorder | Category | Dataset | Evidence renderer |
|---|---|---|---|
| Glioma (brain tumor) | structural | BraTS | lesion-mask overlay |
| Ischemic stroke | structural | ATLAS v2.0 | lesion-mask overlay (same as tumor) |
| Epilepsy (seizure) | functional / crisis | CHB-MIT scalp EEG | EEG waveform and spectrogram |
| Alzheimer's disease | neurodegenerative | OASIS | atrophy scan pair |

Tumor and stroke share one renderer, so four disorders need only three renderers. If time runs short, the drop order is: stroke first (it reuses the tumor path so its absence loses the least), then Alzheimer's (highest access risk). The floor for a credible demo is tumor plus epilepsy plus one neuro pillar.

## Golden rules (do not break these)

1. Never invent medical or anatomical facts. Every clinical or anatomical statement in a data file, a UI label, or a description must come from either a computed mask-to-atlas overlap or a cited reference. No source means a `NEEDS_SOURCE` placeholder or a `TODO(neuro-review)` marker, never a confident guess. Full rules in `docs/MEDICAL_ACCURACY.md`.
2. Region involvement comes from data, not from the model's prior knowledge. For tumor and stroke, compute it from the actual segmentation mask overlapped with the atlas. For patterns that are literature-level (Alzheimer's atrophy distribution, epilepsy channel involvement), cite the source and label it as a typical pattern, not as this patient's segmented region.
3. Contract first. The shared shapes in `/contract` are the wiring between the two developers. Do not change a shape there without a pull request that both developers review. Build against the fixtures in `/contract` so the two halves can be developed independently.
4. Everything ships "pending expert review". Neurologists review the content for accuracy before it is shown to anyone external. Until sign-off, the UI shows a visible "pending expert review" banner and data carries `review_status: "pending"`.
5. Precompute, do not compute live. The only runtime work in the POC is visual rendering. All imaging math, EEG windowing, spectrograms, and mask overlaps are precomputed offline and served as static assets or JSON. See `docs/ARCHITECTURE.md`.

## Repo map

- `/contract` owned jointly. JSON Schema, example fixtures, and the asset naming spec. This is the interface. Read `docs/DATA_CONTRACT.md`.
- `/backend` owned by Tabeen. Python preprocessing: parcellation export, mask-to-atlas overlap, EEG windowing and spectrograms, and the scripts that emit contract-shaped JSON plus processed assets.
- `/frontend` owned by Abdul Mannan. Next.js app: the React Three Fiber atlas explorer (step 1) and the Niivue evidence viewer (step 2).
- `/docs` shared reference. Architecture, data sources, medical accuracy, roles and git, and the three-day plan.

Each of `/backend` and `/frontend` has its own `CLAUDE.md` with domain-specific rules. Claude Code picks these up based on which directory you are working in. When in `/frontend`, follow `frontend/CLAUDE.md`; when in `/backend`, follow `backend/CLAUDE.md`.

## Skills (use them, do not reinvent)

Prefer the installed skills over writing things from scratch. In particular:

- For any UI work in `/frontend` (components, layout, visual design, styling), invoke the `frontend-design` skill before writing components, and follow its design-token and styling guidance. Good UI is a graded requirement for this POC, so do not skip it.
- If a task produces a Word, PDF, PowerPoint, or spreadsheet deliverable (for example, a written audit or handoff report), use the matching document skill (`docx`, `pdf`, `pptx`, `xlsx`) rather than hand-rolling the file.
- Before creating any file or running code for a task that a skill covers, read that skill's `SKILL.md` first. Several skills can apply to one task.

If a needed skill is not installed, say so rather than guessing at its behavior.

## Conventions

- Commits: conventional style, scoped. `feat(fe): ...`, `feat(data): ...`, `fix(contract): ...`, `docs: ...`.
- Branches: `fe/*` for frontend, `data/*` for backend, `contract/*` for shared-shape changes.
- `main` is protected. Only the repo owner pushes directly. Everyone else opens a pull request and gets one review. Contract changes need a review from the other developer specifically. See `docs/ROLES_AND_GIT.md`.
- Written output formatting for any generated report or doc: sentence-case headings, no em dashes, no decorative horizontal-rule separators, plain black text.

## When unsure

Stop and leave a `TODO(neuro-review)` or a `NEEDS_SOURCE` marker rather than filling a gap with a plausible-sounding fact. A blank that a neurologist fills in is correct. A confident hallucination that reaches a neurologist is the one failure this project cannot afford.
