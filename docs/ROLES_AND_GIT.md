# Roles and git workflow

## Who owns what

Two developers, possibly a third helper. Ownership is by directory so the two can work in parallel without stepping on each other.

Tabeen Bokhat, data and backend. Owns `/backend` and co-owns `/contract`. Responsible for: pulling and subsetting the datasets, exporting the atlas meshes to the contract's glb shape, computing mask-to-atlas region overlap for tumor and stroke, windowing EEG and rendering spectrograms and waveforms for epilepsy, preparing the atrophy scan pairs for Alzheimer's, and emitting all the contract JSON plus processed assets. Also writes the contract schema and the first fixtures.

Abdul Mannan, frontend. Owns `/frontend`. Responsible for: the Next.js app, the React Three Fiber atlas explorer (step 1), the Niivue evidence viewer (step 2), region highlighting and grouping, the side panels, the disorder and case selectors, and all UI polish. Consumes `/contract`, never reaches into `/backend`.

A third helper, if available, is best pointed at whichever side has the deeper backlog at that moment, usually frontend polish or writing and cross-checking region descriptions against references (which is content work, not code).

## The dependency that goes in first

The contract in `/contract` is the wiring, and it lands before either side builds. The ordering:

1. Tabeen writes the contract schema and commits realistic fixtures: `regions.json`, `disorders.json`, one case per renderer type, a placeholder `brain-cortical.glb`, and small sample assets (`base.nii.gz`, `mask.nii.gz`, `spectrogram.png`, `waveform.json`). This is the very first pull request.
2. From that point both work in parallel. Mannan builds the whole frontend against the fixtures. Tabeen replaces fixtures with real data in the same shapes.
3. Anything Mannan needs to test a renderer (a real sample glb, a real sample NIfTI, a real spectrogram) Tabeen provides as an early fixture, ahead of the full pipeline, so Mannan never waits on the complete backend.

The rule of thumb: if one person's work blocks the other's testing, that blocking piece goes in first as a fixture, even a rough one. Real data catches up to the shape; the shape does not wait for real data.

## Git rules

- `main` is protected. Only the repo owner can push to it directly. Everyone else opens a pull request and gets at least one review before merge.
- Branch naming: `data/*` for backend work, `fe/*` for frontend work, `contract/*` for changes to the shared shapes, `docs/*` for documentation.
- Commit style: conventional and scoped. `feat(fe): region hover highlight`, `feat(data): brats mask overlap`, `fix(contract): case schema evidence field`, `docs: data sources`.
- A change to `/contract` needs a review from the other developer specifically, because it is the shared interface. A frontend-only or backend-only change needs a review from anyone.
- CI runs the contract validator (see `docs/DATA_CONTRACT.md`) on every pull request. A red validator blocks merge. This is what stops a shape drift from silently breaking the other side.

## Working with Claude Code across the two areas

Claude Code reads the nearest `CLAUDE.md`. When working in `/frontend`, it follows `frontend/CLAUDE.md`. When in `/backend`, it follows `backend/CLAUDE.md`. Both defer to the root `CLAUDE.md` and to `docs/MEDICAL_ACCURACY.md` for the golden rules.

Keep sessions scoped to one area. A frontend session should not be editing preprocessing scripts, and a backend session should not be editing React components. If a task genuinely spans both, it almost always means the contract needs a change, which is its own `contract/*` pull request reviewed by both people, and then each side consumes the new shape separately.
