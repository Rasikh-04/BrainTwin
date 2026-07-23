"""Compute a lesion mask's overlap with the DK+aseg atlas as contract region_mappings.

This is the grounded tumor/stroke pipeline (root CLAUDE.md golden rules 1-2, backend
CLAUDE.md "Lesion overlap"): region involvement is COMPUTED from the actual
segmentation mask intersected with the atlas, never guessed or taken from what a
disorder "usually" affects.

Two lesion sources feed the same intersection, differing only in how the mask reaches
MNI152 space:
  - BraTS glioma masks are in SRI24 voxel space (skull-stripped, 1mm). They are
    affine-registered to the MNI152 template with dipy (NOT FreeSurfer), and the mask
    is resampled with nearest-neighbour into MNI152.
  - ATLAS v2.0 stroke masks are already in MNI152 space, so they need no registration
    (pass register=False).

Once in MNI152 the mask is intersected with the DK+aseg labelmap from
mni_parcellation.py (built from the same meshes as regions.json, so labels join
regions.json by construction). For every region the lesion touches we record
overlap_voxels and overlap_fraction_of_region, and mark role 'primary' when the
fraction meets PRIMARY_OVERLAP_FRACTION. The provenance states the exact method,
including that the parcellation and registration are approximate and pending review.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np

from mni_parcellation import load_labelmap, region_voxel_counts

PRIMARY_OVERLAP_FRACTION = 0.10  # role=primary at/above this fraction of the region's volume
MIN_OVERLAP_VOXELS = 10          # ignore sub-threshold specks from resampling at region borders


def _register_mask_to_mni(base_path: Path, mask_path: Path, static_img):
    """Affine-register a skull-stripped BraTS T1ce to MNI152 and warp its mask (NN).

    Returns the mask resampled into the static (MNI152) grid as an int array.
    """
    import nibabel as nib
    from dipy.align import affine_registration
    from dipy.align.imaffine import AffineMap
    from nilearn.datasets import load_mni152_brain_mask
    from nilearn.image import get_data

    base = nib.load(str(base_path))
    mask = nib.load(str(mask_path))
    moving = np.asarray(base.dataobj, dtype=np.float32)
    moving_affine = np.asarray(base.affine, dtype=np.float64)

    # Skull-strip the MNI template to match BraTS (which is already skull-stripped),
    # so mutual-information registration is not distracted by scalp/skull.
    static = np.asarray(static_img.dataobj, dtype=np.float32)
    static_affine = np.asarray(static_img.affine, dtype=np.float64)
    brain = get_data(load_mni152_brain_mask(resolution=1)).astype(bool)
    static = static * brain

    _, reg_affine = affine_registration(
        moving, static,
        moving_affine=moving_affine, static_affine=static_affine,
        nbins=32, level_iters=[10000, 1000, 100], sigmas=[3.0, 1.0, 0.0], factors=[4, 2, 1],
    )

    amap = AffineMap(
        reg_affine,
        domain_grid_shape=static.shape, domain_grid2world=static_affine,
        codomain_grid_shape=moving.shape, codomain_grid2world=moving_affine,
    )
    mask_data = np.asarray(mask.dataobj)
    mask_mni = amap.transform(mask_data.astype(np.float32), interpolation="nearest")
    return np.rint(mask_mni).astype(np.int32)


def _load_mask_in_mni(mask_path: Path, labels_affine) -> np.ndarray:
    """Load an already-MNI152 mask (e.g. ATLAS stroke) onto the labelmap grid."""
    import nibabel as nib

    img = nib.load(str(mask_path))
    if not np.allclose(img.affine, labels_affine, atol=1e-3):
        raise ValueError(
            f"{mask_path.name} is not on the MNI152 labelmap grid; it needs registration "
            f"(register=True) or resampling before overlap.")
    return np.asarray(img.dataobj).astype(np.int32)


def compute_region_mappings(
    base_path: Path,
    mask_path: Path,
    *,
    register: bool,
    lesion_values: tuple[int, ...] | None = None,
    source_note: str = "",
) -> tuple[list[dict], dict]:
    """Return (region_mappings, qc). qc has lesion voxel counts for a sanity print.

    lesion_values: which mask integer labels count as lesion (BraTS: 1,2,4). None => any >0.
    """
    from nilearn.datasets import load_mni152_template

    labels, labels_affine, label_to_id = load_labelmap()
    region_totals = region_voxel_counts(labels, label_to_id)

    if register:
        static_img = load_mni152_template(resolution=1)
        if not np.allclose(static_img.affine, labels_affine, atol=1e-3):
            raise ValueError("MNI152 template grid does not match the labelmap grid.")
        mask_mni = _register_mask_to_mni(base_path, mask_path, static_img)
        reg_desc = "BraTS SRI24 -> MNI152 dipy affine registration (mutual information)"
    else:
        mask_mni = _load_mask_in_mni(mask_path, labels_affine)
        reg_desc = "mask supplied already in MNI152 space (no registration)"

    lesion = np.isin(mask_mni, lesion_values) if lesion_values else (mask_mni > 0)
    lesion &= labels > 0  # only voxels that fall inside a labelled brain region
    lesion_total = int(np.count_nonzero(np.isin(mask_mni, lesion_values) if lesion_values
                                        else mask_mni > 0))

    # count lesion voxels per region label in one pass
    hit_labels = labels[lesion]
    vals, counts = np.unique(hit_labels[hit_labels > 0], return_counts=True)
    overlap_by_id = {label_to_id[int(v)]: int(c) for v, c in zip(vals, counts)}

    provenance = (
        f"computed: lesion mask intersect DK+aseg labelmap in MNI152 1mm space. "
        f"{reg_desc}. Labelmap voxelized from the atlas meshes (nearest-region "
        f"assignment within the MNI152 brain mask), so labels are the regions.json ids. "
        f"role=primary when overlap_fraction_of_region >= {PRIMARY_OVERLAP_FRACTION:.2f}. "
        f"Registration and voxel parcellation are approximate; pending expert review."
    )
    if source_note:
        provenance += f" {source_note}"

    mappings = []
    for rid, ov in overlap_by_id.items():
        total = region_totals.get(rid, 0)
        if ov < MIN_OVERLAP_VOXELS or total == 0:
            continue
        frac = ov / total
        mappings.append({
            "region_id": rid,
            "role": "primary" if frac >= PRIMARY_OVERLAP_FRACTION else "secondary",
            "evidence_type": "segmentation_mask",
            "overlap_metric": {
                "overlap_voxels": ov,
                "overlap_fraction_of_region": round(frac, 4),
            },
            "provenance": provenance,
            "notes": "",
        })
    # strongest involvement first (primary before secondary, then by fraction)
    mappings.sort(key=lambda m: (m["role"] != "primary",
                                 -m["overlap_metric"]["overlap_fraction_of_region"]))

    qc = {
        "lesion_voxels_in_mni": lesion_total,
        "lesion_voxels_in_labelled_brain": int(np.count_nonzero(lesion)),
        "regions_touched": len(mappings),
        "primary": [m["region_id"] for m in mappings if m["role"] == "primary"],
    }
    return mappings, qc
