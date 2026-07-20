# Downloads (minimal footprint)

We are visualizing, not training. So we pull a handful of cases per disorder, usually one image plus its mask, not the full cohorts. Total kept on disk is well under 1 GB. The only large transient is stroke (a 4 GB encrypted tarball), and stroke is optional because it shares the tumor renderer.

## What each script pulls and how big it is

| Script | Disorder | Pulls | Kept on disk | Access |
|---|---|---|---|---|
| fetch_tumor.sh | tumor | 8 subjects, t1ce + mask | ~150 MB | Hugging Face, per file |
| fetch_epilepsy.sh | epilepsy | 3 seizure recordings + annotations | ~150 MB | PhysioNet, open |
| fetch_stroke.sh | stroke | 4 GB tarball, decrypt, keep 8 | ~80 MB kept, 4 GB transient | NITRC / S3, agreement + password |
| fetch_alzheimers.py | Alzheimer's | 20 subject GM maps (or Kaggle 2D) | ~30 MB (or ~1.3 GB) | nilearn (terms) or Kaggle |
| fetch_meshes.sh | atlas mesh | DK + subcortical mesh pack | tens of MB | Brainder, CC |

## Resumable downloads

Every download resumes if interrupted. The shell scripts use aria2c if it is installed (parallel, auto-retry, resume) and fall back to curl with resume. Install aria2c for the smoothest experience:

- Ubuntu or WSL: sudo apt install aria2
- macOS: brew install aria2

If a download stops, just run the same script again. It continues where it left off.

## Prerequisites

- aria2c or curl for the shell scripts.
- Python with nilearn for Alzheimer's Route 1: pip install nilearn
- kaggle CLI for the Kaggle routes: pip install kaggle, then put your kaggle.json token in place (kaggle.com, Account, Create New API Token).
- awscli only if you use the anonymous S3 route for stroke: pip install awscli

## How to run

From the repo root:

    bash download/fetch_epilepsy.sh      # open, fast, do this first
    bash download/fetch_tumor.sh         # per-file, small
    bash download/fetch_meshes.sh        # guidance, then convert to glb
    python download/fetch_alzheimers.py  # after agreeing to OASIS terms
    bash download/fetch_stroke.sh        # optional, read the comments first

Everything lands under data/raw/<disorder>/. Add data/raw/ to .gitignore so raw scans never get committed. Remember the licensing note: do not push raw patient-derived files to a public URL.

## The minimum that still proves the POC

If you want the smallest possible pull to get moving: fetch_epilepsy.sh plus fetch_tumor.sh plus fetch_meshes.sh. That is about 300 MB and covers two of the three evidence renderers (lesion overlay and EEG) plus the atlas. Add Alzheimer's (tiny via nilearn) and stroke (optional) after.
