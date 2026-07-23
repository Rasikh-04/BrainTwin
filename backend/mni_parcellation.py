"""Build a volumetric DK+aseg parcellation on the MNI152 1mm grid from our own
atlas meshes, so a lesion mask can be intersected with named atlas regions.

Why this exists (docs/MEDICAL_ACCURACY.md, root CLAUDE.md golden rule 2): tumor and
stroke region involvement must be COMPUTED from the actual lesion mask intersected
with the atlas, never guessed. That needs the atlas as a labelled volume in a shared
space. FreeSurfer recon-all is deliberately NOT used (it would re-parcellate each
patient and is unnecessary here); instead we voxelize the SAME Desikan-Killiany /
aseg surface meshes that already define regions.json and the glbs. Because the label
volume is built from those meshes, every voxel label is a region_id that joins
regions.json BY CONSTRUCTION -- there is no atlas-name-to-region_id mapping to get
wrong.

Method (approximate, and labelled as such in every mapping's provenance): each brain
voxel (inside the MNI152 brain mask) is assigned to the anatomically nearest atlas
region surface (nearest-vertex / Voronoi assignment over all region vertices). This
fills the cortical ribbon and the subcortical volumes into a full-brain labelmap on
the MNI152 grid. It is not a FreeSurfer segmentation; it is a reproducible geometric
parcellation from the published meshes, used only to attribute lesion voxels to
regions. The output is cached under data/derived/ and is regenerable.

Run standalone to (re)build the cache:  python3 backend/mni_parcellation.py
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DERIVED = ROOT / "data" / "derived"
CORTICAL_OBJ = RAW / "meshes" / "pial_DK_obj"
SUBCORTICAL_OBJ = RAW / "meshes" / "subcortical_obj"

LABELS_NII = DERIVED / "mni_dk_aseg_labels.nii.gz"
LABELS_MAP = DERIVED / "mni_dk_aseg_labels.json"  # {"1": "ctx-lh-...", ...}, "0" is background

MNI_RESOLUTION = 1  # mm; matches the grid we register BraTS into


def _load_full_meshes() -> list[tuple[str, np.ndarray]]:
    """(region_id, verts Nx3) for every DK cortical + aseg subcortical mesh, full-res.

    Reuses the exact region_id derivation and OBJ reader that build the glbs and
    regions.json, so the label set is identical to regions.json.
    """
    from build_dataset import load_obj, cortical_region_id, subcortical_region_id

    out: list[tuple[str, np.ndarray]] = []
    for path in sorted(CORTICAL_OBJ.glob("*.obj")):
        rid = cortical_region_id(path.name)
        if rid is None:  # medial-wall "unknown", not a real ROI
            continue
        v, _ = load_obj(path)
        out.append((rid, v))
    for path in sorted(SUBCORTICAL_OBJ.glob("*.obj")):
        rid = subcortical_region_id(path.name)
        v, _ = load_obj(path)
        out.append((rid, v))
    return out


def _mni_grid():
    """Return (shape, affine, brain_mask bool array) for the MNI152 1mm grid."""
    from nilearn.datasets import load_mni152_brain_mask
    from nilearn.image import get_data

    mask_img = load_mni152_brain_mask(resolution=MNI_RESOLUTION)
    mask = get_data(mask_img).astype(bool)
    return mask.shape, np.asarray(mask_img.affine, dtype=np.float64), mask


def build_labelmap(force: bool = False) -> tuple[Path, Path]:
    """Voxelize the meshes into an MNI152-grid labelmap. Cached; returns cache paths."""
    if LABELS_NII.exists() and LABELS_MAP.exists() and not force:
        return LABELS_NII, LABELS_MAP

    import nibabel as nib
    from scipy.spatial import cKDTree

    meshes = _load_full_meshes()
    region_ids = [rid for rid, _ in meshes]
    # label 0 is background; regions are 1..N in mesh order
    id_to_label = {rid: i + 1 for i, rid in enumerate(region_ids)}

    all_verts = np.concatenate([v for _, v in meshes], axis=0)
    vert_label = np.concatenate([
        np.full(len(v), id_to_label[rid], dtype=np.int16) for rid, v in meshes
    ])
    print(f"parcellation: {len(meshes)} regions, {len(all_verts):,} vertices")

    shape, affine, brain = _mni_grid()
    print(f"parcellation: MNI152 grid {shape}, {int(brain.sum()):,} brain voxels")

    # brain-voxel world coordinates (mm) = affine applied to voxel indices
    ijk = np.argwhere(brain)  # (M, 3) int voxel indices
    world = ijk @ affine[:3, :3].T + affine[:3, 3]

    tree = cKDTree(all_verts)
    _, nearest = tree.query(world, k=1, workers=-1)  # nearest vertex per brain voxel

    labels = np.zeros(shape, dtype=np.int16)
    labels[brain] = vert_label[nearest]

    DERIVED.mkdir(parents=True, exist_ok=True)
    nib.save(nib.Nifti1Image(labels, affine), str(LABELS_NII))
    LABELS_MAP.write_text(json.dumps(
        {str(lab): rid for rid, lab in id_to_label.items()}, indent=2) + "\n")
    print(f"parcellation: wrote {LABELS_NII.name} and {LABELS_MAP.name}")
    return LABELS_NII, LABELS_MAP


def load_labelmap():
    """Return (labels int16 array, affine, {label:int -> region_id})."""
    import nibabel as nib

    build_labelmap()
    img = nib.load(str(LABELS_NII))
    label_to_id = {int(k): v for k, v in json.loads(LABELS_MAP.read_text()).items()}
    return np.asarray(img.dataobj), np.asarray(img.affine, dtype=np.float64), label_to_id


def region_voxel_counts(labels: np.ndarray, label_to_id: dict[int, str]) -> dict[str, int]:
    """Total voxels per region in the labelmap (the denominator for overlap fraction)."""
    vals, counts = np.unique(labels[labels > 0], return_counts=True)
    by_label = dict(zip(vals.tolist(), counts.tolist()))
    return {rid: by_label.get(lab, 0) for lab, rid in label_to_id.items()}


if __name__ == "__main__":
    build_labelmap(force=True)
