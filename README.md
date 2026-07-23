# BrainTwin

A web-first proof of concept for a "brain digital twin": explore a normal brain by region, then switch into a disorder or a specific de-identified case and see exactly which regions changed, with every highlighted region traceable back to the real scan, EEG, or report it came from.

This POC proves three things:

1. Mapping is real, not decorative — affected regions come from an actual anatomical atlas intersected with actual patient data, never a guess about where a disorder "should" appear.
2. The two-step interaction works — explore a normal brain by region, then switch into a disorder or case and see the grouped, highlighted changes.
3. Evidence is traceable — every highlighted region links back to the real file it came from, so a reviewer can verify the claim.

See [CLAUDE.md](CLAUDE.md) for the full contract both developers work against, [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for how the pieces fit together, and [docs/MEDICAL_ACCURACY.md](docs/MEDICAL_ACCURACY.md) for the grounding rules that bind every claim in the app.

## Disorders covered

| Disorder | Category | Dataset | Evidence renderer |
|---|---|---|---|
| Glioma (brain tumor) | structural | BraTS | lesion-mask overlay |
| Ischemic stroke | structural | ATLAS v2.0 | lesion-mask overlay (shared with tumor) |
| Epilepsy (seizure) | functional / crisis | CHB-MIT scalp EEG | EEG waveform and spectrogram |
| Alzheimer's disease | neurodegenerative | OASIS | atrophy scan pair |

## How it's built

- `/frontend` — Next.js app. Step 1 is a React Three Fiber (Three.js) atlas explorer; step 2 is a Niivue evidence viewer (NIfTI overlays, atrophy pairs, EEG spectrograms). All content is static JSON and static assets served from `/public`; there is no runtime backend.
- `/backend` — offline Python preprocessing. Reads raw datasets under `data/raw/` and emits the contract-shaped JSON plus processed assets (atlas meshes, mask overlays, EEG windows). Nothing here runs at app runtime.
- `/contract` — the shared interface between the two sides: JSON Schema, fixtures, and a validator that CI runs on every pull request.
- `/download` — scripts that fetch each disorder's raw dataset into `data/raw/`.
- `/docs` — architecture, data sources and access steps, the data contract spec, and the medical-accuracy rules.

## Repo-wide dependencies

These are the general/system-level requirements. Package-level dependencies are pinned in [frontend/package.json](frontend/package.json) and [backend/requirements.txt](backend/requirements.txt) — this list is just what you need installed on your machine before those work.

| Tool | Minimum | Notes |
|---|---|---|
| Node.js | 20+ | required by Next.js 16; developed against Node 24 |
| npm | 10+ | ships with Node; developed against npm 11 |
| Python | 3.11+ | developed/tested on 3.14; `pyedflib` has no 3.14 wheel, so `backend/edf_reader.py` is a hand-rolled EDF reader instead |
| pip | any recent | for `backend/requirements.txt` |
| git | any recent | |
| aria2c (optional) | any | parallel/resumable downloads in `download/*.sh`; falls back to `curl` if absent |
| kaggle CLI (optional) | any | only for the Kaggle mirror route in `download/fetch_tumor.sh` / `fetch_alzheimers.py` |
| awscli (optional) | any | only for the anonymous S3 route in `download/fetch_stroke.sh` |

Frontend package highlights (see `frontend/package.json` for the full, versioned list): Next.js 16, React 19, Three.js + `@react-three/fiber` / `@react-three/drei`, `@niivue/niivue`, Zustand, Tailwind CSS 4, Vitest, Playwright, TypeScript 5.

Backend package highlights (see `backend/requirements.txt` for the full list): `numpy`, `scipy`, `nibabel`, `nilearn`, `pillow`, `pygltflib`, `fast-simplification`, `dipy`.

## Getting started

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

Other useful scripts: `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` (Vitest), `npm run test:e2e` (Playwright).

The frontend can run against the fixtures in `/contract` without any backend setup — it doesn't need the raw datasets or the Python pipeline to boot.

### Backend (regenerating the dataset)

```bash
pip install -r backend/requirements.txt
python3 backend/build_dataset.py       # writes contract JSON + processed assets
python3 contract/validate.py --check-assets
```

`build_dataset.py` reads from `data/raw/<disorder>/` (fetched separately, see below) and writes:

- `contract/fixtures/{regions,disorders,cases/*}.json` (canonical) and the same JSON mirrored to `frontend/public/data/...`
- `frontend/public/assets/atlas/*.glb` — atlas meshes (CC-licensed, committed to git)
- `frontend/public/assets/cases/<case_id>/...` — patient-derived scans, masks, EEG assets (git-ignored; DUAs restrict redistribution)

### Fetching raw datasets

```bash
bash download/fetch_epilepsy.sh      # open, fast — do this first
bash download/fetch_tumor.sh         # per-file, small
bash download/fetch_meshes.sh        # atlas mesh pack
python download/fetch_alzheimers.py  # after agreeing to the OASIS terms
bash download/fetch_stroke.sh        # optional, read the script's comments first
```

Everything lands under `data/raw/<disorder>/`, which is git-ignored. See [docs/DATA_SOURCES.md](docs/DATA_SOURCES.md) for what each dataset needs (open download vs. registration vs. a Data Use Agreement) and [download/README.md](download/README.md) for size and prerequisites per script.

### Validating the contract

```bash
python3 contract/validate.py                 # structural checks (what CI runs)
python3 contract/validate.py --check-assets   # also verify asset files exist locally
```

## Licensing note

Frontend code and the atlas meshes are CC-licensed and safe to deploy publicly. Patient-derived case assets (NIfTI scans, masks, EEG data) are git-ignored on purpose — their Data Use Agreements generally restrict redistribution, so keep them local or behind auth. See "Deployment and a licensing caution" in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

This project's own code is licensed under Apache 2.0 — see [LICENSE](LICENSE).
