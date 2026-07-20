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

# Decimation: keep the atlas light enough for a laptop/phone. Faces kept = 1 - reduction.
CORTICAL_REDUCTION = 0.75
SUBCORTICAL_REDUCTION = 0.55

PRIMARY_OVERLAP_FRACTION = 0.10  # documented threshold, used by the lesion pipeline (not here yet)


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
    shutil.copyfile(src / f"{src_case}_t1ce.nii.gz", out / "base.nii.gz")
    shutil.copyfile(src / f"{src_case}_seg.nii.gz", out / "mask.nii.gz")

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
        # Left EMPTY on purpose. Real mask-to-DK-atlas overlap needs BraTS registered
        # into the atlas space; that is the backend registration pipeline, not a guess.
        # TODO(data): compute region_mappings from mask.nii.gz intersect DK atlas in a
        # shared space; mark role primary when overlap_fraction_of_region >= 0.10.
        "region_mappings": [],
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


def build_disorders(case_ids: dict):
    disorders = [
        {"disorder_id": "glioma", "name": "Glioma (brain tumor)", "category": "structural",
         "evidence_renderer": "lesion-overlay", "case_ids": [case_ids["glioma"]]},
        {"disorder_id": "ischemic-stroke", "name": "Ischemic stroke", "category": "structural",
         "evidence_renderer": "lesion-overlay", "case_ids": []},  # ATLAS not yet downloaded
        {"disorder_id": "epilepsy", "name": "Epilepsy (seizure)", "category": "functional",
         "evidence_renderer": "eeg", "case_ids": [case_ids["epilepsy"]]},
        {"disorder_id": "alzheimers", "name": "Alzheimer's disease", "category": "neurodegenerative",
         "evidence_renderer": "atrophy-pair", "case_ids": []},  # OASIS pair deferred
    ]
    out = []
    for d in disorders:
        out.append({
            **d,
            "description": "NEEDS_SOURCE",
            "description_source": None,
            "typical_affected_regions": [],
            "review_status": "pending",
        })
    write_json_both("disorders.json", out)
    print(f"disorders.json: {len(out)} disorders "
          f"(stroke + alzheimers listed with empty case_ids)")


def main():
    build_atlas()
    tumor = build_tumor()
    epilepsy = build_epilepsy()
    build_disorders({"glioma": tumor["case_id"], "epilepsy": epilepsy["case_id"]})
    print("\ndone. JSON -> contract/fixtures + frontend/public/data ; "
          "assets -> frontend/public/assets")


if __name__ == "__main__":
    main()
