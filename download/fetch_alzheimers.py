#!/usr/bin/env python3
"""
Alzheimer's minimal fetch. Two routes, pick one.

Route 1 (smallest, ~tens of MB): OASIS-1 via nilearn.
Downloads a small subset of processed gray-matter maps with clinical labels
(age, sex, CDR). Atrophy shows up as reduced gray matter, which is exactly the
signal we want. Requires that you have agreed to the OASIS data use terms first.

    pip install nilearn
    python fetch_alzheimers.py

Route 2 (2D slices, zero sign-off): the Kaggle mirror, JPEG slices.
    pip install kaggle
    kaggle datasets download -d ninadaithal/imagesoasis -p data/raw/alzheimers
This is instant and needs no agreement, but it is 2D, so no 3D view and no atlas
mapping. Good as a guaranteed fallback.
"""

from pathlib import Path

OUT = Path("data/raw/alzheimers")
OUT.mkdir(parents=True, exist_ok=True)

def main():
    from nilearn import datasets

    # A few nondemented plus a few AD subjects is plenty for the POC visual.
    oasis = datasets.fetch_oasis_vbm(n_subjects=20, data_dir=str(OUT))

    gm = oasis.gray_matter_maps
    print(f"Downloaded {len(gm)} gray-matter maps into {OUT}")
    print("Example map:", gm[0])

    # Clinical variables include CDR, age, sex. Use CDR to pick a normal (0)
    # versus AD (>=1) pair for the atrophy comparison.
    fields = list(oasis.ext_vars.columns)
    print("Clinical fields available:", fields)


if __name__ == "__main__":
    main()
