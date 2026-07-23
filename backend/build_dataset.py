"""Build the wired contract dataset from the real downloaded data.

Reads data/raw/* and emits the contract-shaped files the frontend fetches:

  contract/fixtures/regions.json          (also -> frontend/public/data/)
  contract/fixtures/disorders.json        (also -> frontend/public/data/)
  contract/fixtures/cases/<case_id>.json  (also -> frontend/public/data/cases/)
  frontend/public/assets/atlas/brain-cortical.glb      (committed, CC-licensed mesh)
  frontend/public/assets/atlas/brain-subcortical.glb   (committed, CC-licensed mesh)
  frontend/public/assets/cases/<case_id>/...           (git-ignored, patient-derived)

Grounding rules (see docs/MEDICAL_ACCURACY.md) are enforced here:
  - No anatomical / clinical prose is invented. Descriptions ship as NEEDS_SOURCE.
  - Tumor region_mappings are left EMPTY with a TODO; real mask-to-atlas overlap is
    the backend registration pipeline's job, not a guess.
  - EEG involvement is labelled scalp-channel-level and approximate.
  - Everything ships review_status: "pending".

Run:  python3 backend/build_dataset.py
This is offline precompute. Nothing here runs at app runtime.
"""
from __future__ import annotations

import json
import re
import shutil
import struct
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
FIXTURES = ROOT / "contract" / "fixtures"
PUBLIC_DATA = ROOT / "frontend" / "public" / "data"
ASSETS = ROOT / "frontend" / "public" / "assets"

CORTICAL_OBJ = RAW / "meshes" / "pial_DK_obj"
SUBCORTICAL_OBJ = RAW / "meshes" / "subcortical_obj"
OASIS_DIR = RAW / "alzheimers" / "oasis1"
OASIS_CSV = OASIS_DIR / "oasis_cross-sectional.csv"

# Decimation: keep the atlas light enough for a laptop/phone. Faces kept = 1 - reduction.
CORTICAL_REDUCTION = 0.75
SUBCORTICAL_REDUCTION = 0.55

PRIMARY_OVERLAP_FRACTION = 0.10  # documented threshold, used by the lesion pipeline (not here yet)

# Alzheimer's atrophy pattern. This is a LITERATURE-LEVEL pattern (docs/MEDICAL_ACCURACY.md
# "the atrophy caveat"), NOT a segmentation of any one scan. It is grounded in two real,
# verified references and every region_id below is a node in regions.json:
#   PMID:1759558  Braak & Braak 1991, Acta Neuropathol 82(4):239-259  (transentorhinal ->
#                 hippocampus/limbic -> neocortex progression)
#   PMID:1431963  Scheltens et al. 1992, J Neurol Neurosurg Psychiatry 55(10):967-72
#                 (MRI medial-temporal / hippocampal atrophy in AD vs controls)
# Kept deliberately tight to the early, best-established medial-temporal set so nothing
# is overclaimed. Entorhinal + hippocampus are the earliest/most robust (primary);
# parahippocampal + amygdala are the wider medial-temporal ring (secondary).
AD_SOURCE = "PMID:1759558; PMID:1431963"
AD_PATTERN: list[tuple[str, str]] = [
    ("ctx-lh-entorhinal", "primary"),
    ("ctx-rh-entorhinal", "primary"),
    ("aseg-left-hippocampus", "primary"),
    ("aseg-right-hippocampus", "primary"),
    ("ctx-lh-parahippocampal", "secondary"),
    ("ctx-rh-parahippocampal", "secondary"),
    ("aseg-left-amygdala", "secondary"),
    ("aseg-right-amygdala", "secondary"),
]


# --------------------------------------------------------------------------- #
# region_id naming (the join key between regions.json and the glb node names)
# --------------------------------------------------------------------------- #

def cortical_region_id(fname: str) -> str | None:
    # lh.pial.DK.superiorfrontal.obj -> ctx-lh-superiorfrontal
    m = re.match(r"^(lh|rh)\.pial\.DK\.(.+)\.obj$", fname)
    if not m:
        return None
    hemi, label = m.group(1), m.group(2)
    if label == "unknown":  # medial wall / non-cortex, not a real ROI
        return None
    return f"ctx-{hemi}-{label}"


def subcortical_region_id(fname: str) -> str:
    # Left-Hippocampus.obj -> aseg-left-hippocampus ; 3rd-Ventricle.obj -> aseg-3rd-ventricle
    stem = fname[:-4] if fname.endswith(".obj") else fname
    slug = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-")
    return f"aseg-{slug}"


def humanize(region_id: str) -> str:
    if region_id.startswith("ctx-"):
        _, hemi, label = region_id.split("-", 2)
        side = {"lh": "Left", "rh": "Right"}[hemi]
        words = re.sub(r"([a-z])([A-Z])", r"\1 \2", label)
        return f"{side} {words}"
    # aseg
    rest = region_id[len("aseg-"):]
    return rest.replace("-", " ").title()


def hemisphere_of(region_id: str) -> str:
    if region_id.startswith("ctx-lh-") or region_id.startswith("aseg-left-"):
        return "left"
    if region_id.startswith("ctx-rh-") or region_id.startswith("aseg-right-"):
        return "right"
    return "midline"


# --------------------------------------------------------------------------- #
# OBJ + mesh helpers
# --------------------------------------------------------------------------- #

def load_obj(path: Path):
    verts, faces = [], []
    with open(path) as f:
        for line in f:
            if line.startswith("v "):
                verts.append([float(x) for x in line.split()[1:4]])
            elif line.startswith("f "):
                # faces are plain 1-indexed ints in these meshes (no slashes)
                idx = [int(p.split("/")[0]) for p in line.split()[1:4]]
                faces.append([i - 1 for i in idx])
    return np.asarray(verts, dtype=np.float64), np.asarray(faces, dtype=np.int64)


def decimate(verts, faces, reduction):
    if reduction <= 0 or len(faces) < 200:
        return verts, faces
    import fast_simplification
    v, f = fast_simplification.simplify(
        verts.astype(np.float32), faces.astype(np.int32), target_reduction=reduction
    )
    return v.astype(np.float64), f.astype(np.int64)


def vertex_normals(verts, faces):
    n = np.zeros(verts.shape, dtype=np.float64)
    tris = verts[faces]
    fn = np.cross(tris[:, 1] - tris[:, 0], tris[:, 2] - tris[:, 0])
    for i in range(3):
        np.add.at(n, faces[:, i], fn)
    lens = np.linalg.norm(n, axis=1, keepdims=True)
    lens[lens == 0] = 1.0
    return n / lens


# --------------------------------------------------------------------------- #
# glb writer (one named node per region -> raycastable, material-swappable)
# --------------------------------------------------------------------------- #

def write_glb(regions: list[tuple[str, np.ndarray, np.ndarray]], out_path: Path):
    """regions: list of (region_id, verts Nx3 float, faces Mx3 int)."""
    from pygltflib import (
        GLTF2, Scene, Node, Mesh, Primitive, Attributes, Buffer, BufferView,
        Accessor, ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER, FLOAT, UNSIGNED_INT, SCALAR, VEC3,
    )

    blob = bytearray()
    bufferviews, accessors, meshes, nodes = [], [], [], []

    def add_view(data: bytes, target: int) -> int:
        # 4-byte align
        while len(blob) % 4 != 0:
            blob.append(0)
        offset = len(blob)
        blob.extend(data)
        bufferviews.append(BufferView(buffer=0, byteOffset=offset, byteLength=len(data), target=target))
        return len(bufferviews) - 1

    for region_id, verts, faces in regions:
        normals = vertex_normals(verts, faces)
        pos = verts.astype(np.float32)
        nrm = normals.astype(np.float32)
        idx = faces.astype(np.uint32).reshape(-1)

        pos_view = add_view(pos.tobytes(), ARRAY_BUFFER)
        accessors.append(Accessor(bufferView=pos_view, componentType=FLOAT, count=len(pos),
                                  type=VEC3, min=pos.min(axis=0).tolist(), max=pos.max(axis=0).tolist()))
        pos_acc = len(accessors) - 1

        nrm_view = add_view(nrm.tobytes(), ARRAY_BUFFER)
        accessors.append(Accessor(bufferView=nrm_view, componentType=FLOAT, count=len(nrm), type=VEC3))
        nrm_acc = len(accessors) - 1

        idx_view = add_view(idx.tobytes(), ELEMENT_ARRAY_BUFFER)
        accessors.append(Accessor(bufferView=idx_view, componentType=UNSIGNED_INT, count=len(idx), type=SCALAR))
        idx_acc = len(accessors) - 1

        meshes.append(Mesh(primitives=[Primitive(
            attributes=Attributes(POSITION=pos_acc, NORMAL=nrm_acc), indices=idx_acc)],
            name=region_id))
        nodes.append(Node(mesh=len(meshes) - 1, name=region_id))

    gltf = GLTF2(
        scene=0,
        scenes=[Scene(nodes=list(range(len(nodes))))],
        nodes=nodes, meshes=meshes, accessors=accessors, bufferViews=bufferviews,
        buffers=[Buffer(byteLength=len(blob))],
    )
    gltf.set_binary_blob(bytes(blob))
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gltf.save_binary(str(out_path))


# --------------------------------------------------------------------------- #
# output helpers
# --------------------------------------------------------------------------- #

def write_json_both(rel: str, obj):
    text = json.dumps(obj, indent=2) + "\n"
    for base in (FIXTURES, PUBLIC_DATA):
        p = base / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text)


def region_record(region_id: str, atlas_source: str, structure_type: str, centroid) -> dict:
    return {
        "region_id": region_id,
        "name": humanize(region_id),
        "atlas_source": atlas_source,
        "hemisphere": hemisphere_of(region_id),
        "structure_type": structure_type,
        "centroid_mni": [round(float(c), 1) for c in centroid],
        "normal_function_description": "NEEDS_SOURCE",
        "description_source": None,
        "review_status": "pending",
    }


# --------------------------------------------------------------------------- #
# builders
# --------------------------------------------------------------------------- #

def build_atlas() -> list[str]:
    print("atlas: reading cortical + subcortical OBJs")
    regions_json = []

    cort_meshes = []
    for path in sorted(CORTICAL_OBJ.glob("*.obj")):
        rid = cortical_region_id(path.name)
        if rid is None:
            continue
        v, f = load_obj(path)
        v, f = decimate(v, f, CORTICAL_REDUCTION)
        cort_meshes.append((rid, v, f))
        regions_json.append(region_record(rid, "desikan-killiany", "cortical", v.mean(axis=0)))
    write_glb(cort_meshes, ASSETS / "atlas" / "brain-cortical.glb")
    print(f"  brain-cortical.glb: {len(cort_meshes)} regions, "
          f"{sum(len(v) for _, v, _ in cort_meshes)} verts")

    sub_meshes = []
    for path in sorted(SUBCORTICAL_OBJ.glob("*.obj")):
        rid = subcortical_region_id(path.name)
        v, f = load_obj(path)
        v, f = decimate(v, f, SUBCORTICAL_REDUCTION)
        sub_meshes.append((rid, v, f))
        regions_json.append(region_record(rid, "aseg", "subcortical", v.mean(axis=0)))
    write_glb(sub_meshes, ASSETS / "atlas" / "brain-subcortical.glb")
    print(f"  brain-subcortical.glb: {len(sub_meshes)} regions, "
          f"{sum(len(v) for _, v, _ in sub_meshes)} verts")

    write_json_both("regions.json", regions_json)
    print(f"  regions.json: {len(regions_json)} regions")
    return [r["region_id"] for r in regions_json]


def build_tumor(case_id="brats-001", src_case="BraTS2021_00000") -> dict:
    print(f"tumor: {case_id} <- {src_case}")
    src = RAW / "tumor" / src_case
    out = ASSETS / "cases" / case_id
    out.mkdir(parents=True, exist_ok=True)
    base_src = src / f"{src_case}_t1ce.nii.gz"
    mask_src = src / f"{src_case}_seg.nii.gz"
    shutil.copyfile(base_src, out / "base.nii.gz")
    shutil.copyfile(mask_src, out / "mask.nii.gz")

    # Grounded region involvement (root CLAUDE.md golden rules 1-2): computed from the
    # actual segmentation mask intersected with the DK+aseg atlas, never guessed. BraTS
    # is in SRI24 space, so lesion_overlap registers it to MNI152 (dipy affine, NOT
    # FreeSurfer) before the intersection. Labels 1/2/4 (necrotic/edema/enhancing) are
    # merged as the lesion extent.
    from lesion_overlap import compute_region_mappings

    mappings, qc = compute_region_mappings(
        base_src, mask_src, register=True, lesion_values=(1, 2, 4),
        source_note="glioma extent = segmentation labels 1 (necrotic core), 2 (edema), "
                    "4 (enhancing tumor) merged.",
    )
    print(f"  overlap: {qc['regions_touched']} regions touched, "
          f"primary={qc['primary']} "
          f"({qc['lesion_voxels_in_labelled_brain']}/{qc['lesion_voxels_in_mni']} "
          f"lesion voxels inside a labelled region)")

    case = {
        "case_id": case_id,
        "disorder_id": "glioma",
        "source_dataset": "BraTS",
        # BraTS in-hand files carry no de-identified age/sex fields, so we invent nothing.
        "anonymized_meta": {},
        "report_summary": "NEEDS_SOURCE",
        "evidence": {
            "renderer": "lesion-overlay",
            "base": f"/assets/cases/{case_id}/base.nii.gz",
            "mask": f"/assets/cases/{case_id}/mask.nii.gz",
            "mask_labels": {"1": "necrotic core", "2": "edema", "4": "enhancing tumor"},
        },
        "region_mappings": mappings,
        "review_status": "pending",
    }
    write_json_both(f"cases/{case_id}.json", case)
    return case


def build_epilepsy(case_id="chbmit-01") -> dict:
    print(f"epilepsy: {case_id} <- chb01_03.edf")
    from edf_reader import Edf

    edf_path = RAW / "epilepsy" / "chb01" / "chb01_03.edf"
    onset, offset = 2996, 3036  # from chb01-summary.txt (real annotation)
    pad = 10
    involved = ["F7-T7", "T7-P7"]  # left temporal chain (scalp-level, approximate)

    edf = Edf(str(edf_path))
    fs, sig = edf.read_window(onset - pad, offset + pad)

    out = ASSETS / "cases" / case_id
    out.mkdir(parents=True, exist_ok=True)

    # waveform.json: downsample to ~128 Hz, keep all channels, round to 2 dp
    target_fs = 128.0
    step = max(int(round(fs / target_fs)), 1)
    ds_fs = fs / step
    channels = []
    for lab in edf.labels:
        if lab in sig and sig[lab].size:
            channels.append({"name": lab, "values": [round(float(x), 2) for x in sig[lab][::step]]})
    waveform = {
        "sampling_rate_hz": round(ds_fs, 3),
        "window": {"start_s": onset - pad, "end_s": offset + pad},
        "onset_s": onset,
        "duration_s": offset - onset,
        "units": "uV",
        "involved_channels": involved,
        "channels": channels,
    }
    (out / "waveform.json").write_text(json.dumps(waveform) + "\n")

    # spectrogram.png of the first involved channel
    make_spectrogram(sig[involved[0]], fs, out / "spectrogram.png")

    case = {
        "case_id": case_id,
        "disorder_id": "epilepsy",
        "source_dataset": "CHB-MIT",
        "anonymized_meta": {"age_band": "10-19", "sex": "F"},  # chb01: known 11yo female
        "report_summary": "NEEDS_SOURCE",
        "evidence": {
            "renderer": "eeg",
            "spectrogram": f"/assets/cases/{case_id}/spectrogram.png",
            "waveform": f"/assets/cases/{case_id}/waveform.json",
            "onset_seconds": onset,
            "duration_seconds": offset - onset,
            "involved_channels": involved,
        },
        "region_mappings": [
            {
                "region_id": "ctx-lh-superiortemporal",
                "role": "primary",
                "evidence_type": "eeg",
                "overlap_metric": None,
                "provenance": ("scalp-channel-level and approximate: channels F7-T7, T7-P7 "
                               "overlie left temporal cortex; not a localized brain focus"),
                "notes": "scalp EEG cannot localize a precise brain focus",
            }
        ],
        "review_status": "pending",
    }
    write_json_both(f"cases/{case_id}.json", case)
    return case


def make_spectrogram(x, fs, out_path: Path):
    from PIL import Image
    from scipy import signal

    f, t, Sxx = signal.spectrogram(np.asarray(x), fs=fs, nperseg=256, noverlap=192)
    f_keep = f <= 40  # clinical EEG band of interest
    S = Sxx[f_keep]
    S = 10 * np.log10(S + 1e-12)
    S = (S - S.min()) / (S.max() - S.min() + 1e-12)
    S = np.flipud(S)  # low freq at bottom

    # simple perceptual-ish colormap (black -> blue -> yellow) without matplotlib
    r = np.clip(1.6 * S - 0.6, 0, 1)
    g = np.clip(1.6 * S - 0.3, 0, 1)
    b = np.clip(1.4 * S, 0, 1) * (1 - S) + S * 0.2
    rgb = (np.dstack([r, g, b]) * 255).astype(np.uint8)
    img = Image.fromarray(rgb).resize((900, 300), Image.BILINEAR)
    img.save(out_path)


def select_oasis_pair() -> tuple[dict, dict]:
    """Pick a CDR 0 reference subject and a CDR 2 Alzheimer's subject from OASIS-1.

    Deterministic and reproducible: the AD subject is the CDR 2 case with the lowest
    MMSE (most advanced, clearest atrophy), preferring female so the age/sex-matched
    control pool is larger; the reference is the same-sex CDR 0 subject closest in age.
    Both must have GM maps present on disk. Returns (reference_row, ad_row).
    """
    import csv

    present = {p.name for p in OASIS_DIR.iterdir() if p.is_dir() and p.name.startswith("OAS1_")}
    rows = []
    with open(OASIS_CSV, newline="") as f:
        for r in csv.DictReader(f):
            if r["ID"] in present and r.get("CDR") not in ("", None):
                rows.append(r)

    def cdr(r: dict) -> float:
        return float(r["CDR"])

    def age(r: dict) -> int:
        return int(r["Age"])

    def mmse(r: dict) -> float:
        return float(r["MMSE"]) if r.get("MMSE") else 99.0

    ad_pool = sorted((r for r in rows if cdr(r) == 2.0),
                     key=lambda r: (r["M/F"] != "F", mmse(r), r["ID"]))
    if not ad_pool:
        raise RuntimeError("no CDR 2 OASIS subject with GM maps on disk")
    ad = ad_pool[0]

    ref_pool = sorted((r for r in rows if cdr(r) == 0.0 and r["M/F"] == ad["M/F"]),
                      key=lambda r: (abs(age(r) - age(ad)), r["ID"]))
    if not ref_pool:
        raise RuntimeError(f"no CDR 0 {ad['M/F']} reference subject with GM maps on disk")
    return ref_pool[0], ad


def gm_map_path(subject_id: str) -> Path:
    """The modulated GM probability map (VBM, MNI152) for an OASIS subject."""
    matches = sorted((OASIS_DIR / subject_id).glob("mwrc1*.nii.gz"))
    if not matches:
        raise FileNotFoundError(f"no mwrc1 GM map for {subject_id}")
    return matches[0]


def age_band(age: int) -> str:
    lo = (age // 10) * 10
    return f"{lo}-{lo + 9}"


def build_alzheimers(case_id="oasis-001") -> dict:
    """Cross-sectional atrophy evidence for Alzheimer's, from OASIS-1 VBM GM maps.

    HONESTY (docs/MEDICAL_ACCURACY.md "the atrophy caveat"): OASIS-1 ships no per-voxel
    atrophy mask and no same-patient longitudinal pair. So this is an honest cross-sectional
    comparison of TWO DIFFERENT de-identified subjects -- a CDR 0 reference and a CDR 2 AD
    case -- reusing the atrophy-pair renderer's baseline/followup slots (baseline = the CDR 0
    reference, followup = the CDR 2 case). The affected-region set is the cited literature
    pattern (AD_PATTERN), never a segmentation of this scan. The "different subjects, not
    longitudinal" caveat is carried in every mapping's provenance and notes.
    """
    ref, ad = select_oasis_pair()
    print(f"alzheimers: {case_id} <- reference {ref['ID']} (CDR {ref['CDR']}, {ref['M/F']}, "
          f"{ref['Age']}y) vs case {ad['ID']} (CDR {ad['CDR']}, {ad['M/F']}, {ad['Age']}y)")

    out = ASSETS / "cases" / case_id
    out.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(gm_map_path(ref["ID"]), out / "baseline.nii.gz")
    shutil.copyfile(gm_map_path(ad["ID"]), out / "followup.nii.gz")

    provenance = (
        f"cited literature pattern ({AD_SOURCE}): typical medial-temporal atrophy in "
        f"Alzheimer's disease, NOT segmented from this scan. Scan pair is a cross-sectional "
        f"OASIS-1 comparison of two different subjects -- a CDR 0 reference ({ref['M/F']}, "
        f"{age_band(int(ref['Age']))}) vs this CDR {int(float(ad['CDR']))} case -- using "
        f"modulated GM probability maps (VBM) in MNI152 space; not a longitudinal same-patient pair."
    )
    mappings = [
        {
            "region_id": rid,
            "role": role,
            "evidence_type": "atrophy",
            "overlap_metric": None,
            "provenance": provenance,
            "notes": "literature-level typical pattern, not a per-voxel atrophy segmentation of this patient",
        }
        for rid, role in AD_PATTERN
    ]

    case = {
        "case_id": case_id,
        "disorder_id": "alzheimers",
        "source_dataset": "OASIS-1",
        # Only the de-identified bands OASIS provides, for the AD case subject. The reference
        # subject's bands live in the mapping provenance above (one meta slot per case).
        "anonymized_meta": {"age_band": age_band(int(ad["Age"])), "sex": ad["M/F"]},
        "report_summary": "NEEDS_SOURCE",  # a clinical read is not ours to write; TODO(neuro-review)
        "evidence": {
            "renderer": "atrophy-pair",
            "baseline": f"/assets/cases/{case_id}/baseline.nii.gz",
            "followup": f"/assets/cases/{case_id}/followup.nii.gz",
        },
        "region_mappings": mappings,
        "review_status": "pending",
    }
    write_json_both(f"cases/{case_id}.json", case)
    return case


def build_disorders(case_ids: dict):
    disorders = [
        {"disorder_id": "glioma", "name": "Glioma (brain tumor)", "category": "structural",
         "evidence_renderer": "lesion-overlay", "case_ids": [case_ids["glioma"]]},
        {"disorder_id": "ischemic-stroke", "name": "Ischemic stroke", "category": "structural",
         "evidence_renderer": "lesion-overlay", "case_ids": []},  # ATLAS not yet downloaded
        {"disorder_id": "epilepsy", "name": "Epilepsy (seizure)", "category": "functional",
         "evidence_renderer": "eeg", "case_ids": [case_ids["epilepsy"]]},
        {"disorder_id": "alzheimers", "name": "Alzheimer's disease", "category": "neurodegenerative",
         "evidence_renderer": "atrophy-pair", "case_ids": [case_ids["alzheimers"]]},
    ]
    # Literature-level typical patterns (docs/MEDICAL_ACCURACY.md type 2). Only Alzheimer's
    # has a cited pattern here; tumor/stroke stay empty (their involvement is per-case computed,
    # not typical) and epilepsy's scalp-level involvement lives on its case, not as a "typical region".
    typical = {
        "alzheimers": [
            {"region_id": rid, "source": AD_SOURCE,
             "note": f"typical medial-temporal atrophy region in AD ({role} pattern; literature, not segmented)"}
            for rid, role in AD_PATTERN
        ],
    }
    out = []
    for d in disorders:
        out.append({
            **d,
            "description": "NEEDS_SOURCE",
            "description_source": None,
            "typical_affected_regions": typical.get(d["disorder_id"], []),
            "review_status": "pending",
        })
    write_json_both("disorders.json", out)
    print(f"disorders.json: {len(out)} disorders "
          f"(stroke listed with empty case_ids; alzheimers now wired)")


def main():
    build_atlas()
    tumor = build_tumor()
    epilepsy = build_epilepsy()
    alzheimers = build_alzheimers()
    build_disorders({
        "glioma": tumor["case_id"],
        "epilepsy": epilepsy["case_id"],
        "alzheimers": alzheimers["case_id"],
    })
    print("\ndone. JSON -> contract/fixtures + frontend/public/data ; "
          "assets -> frontend/public/assets")


if __name__ == "__main__":
    main()
