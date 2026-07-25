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
Case building (dipy affine registration to MNI152) is the expensive step, so a case
whose JSON already exists under contract/fixtures/cases/ is reused as-is rather than
rebuilt -- add --force to ignore the cache and rebuild every case from raw data.
This is offline precompute. Nothing here runs at app runtime.
"""
from __future__ import annotations

import json
import re
import shutil
import struct
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
DERIVED = ROOT / "data" / "derived"
FIXTURES = ROOT / "contract" / "fixtures"
PUBLIC_DATA = ROOT / "frontend" / "public" / "data"
ASSETS = ROOT / "frontend" / "public" / "assets"

CORTICAL_OBJ = RAW / "meshes" / "pial_DK_obj"
SUBCORTICAL_OBJ = RAW / "meshes" / "subcortical_obj"
OASIS_DIR = RAW / "alzheimers" / "oasis1"
OASIS_CSV = OASIS_DIR / "oasis_cross-sectional.csv"
STROKE_DIR = RAW / "stroke"

# Deterministic ATLAS v2.0 stroke-case selection: prefer a lesion big enough to touch
# several regions (a visible territorial stroke) but not a whole-hemisphere infarct, so
# the demo highlight is legible. Nearest-to-target voxel count, tie-broken by subject id.
STROKE_TARGET_VOXELS = 15000   # ~15 cc at 1mm; a solid, clearly territorial lesion
STROKE_MIN_VOXELS = 2000       # drop tiny lacunes that highlight ~nothing
STROKE_MAX_VOXELS = 80000      # drop near-hemisphere infarcts that light up everything

# How many demo cases to wire per structural disorder, to show position/intensity
# variety across real subjects (the "vary position and intensity" ask). Bounded by how
# many subjects are actually extracted on disk; the selectors spread across the lesion-
# size range so the picker spans small -> large lesions in different regions.
N_STROKE_CASES = 6   # from the extracted ATLAS 3.0 subjects
N_TUMOR_CASES = 4    # from the downloaded BraTS subjects
N_HEMORRHAGE_CASES = 4  # from CT-ICH, once its DUA-gated download lands (dormant until then)

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
# multi-case selection + labelling
# --------------------------------------------------------------------------- #

def spread_pick(items: list, n: int) -> list:
    """Pick up to n items evenly spread across a list (both ends included).

    `items` must be pre-sorted by whatever axis the spread should span (e.g. lesion
    volume). Deterministic: same input -> same picks. Used so the demo cases cover the
    small -> large range instead of clustering, which is what makes the position/intensity
    variety visible in the case picker.
    """
    if n <= 0:
        return []
    if len(items) <= n:
        return list(items)
    idxs = sorted({round(i * (len(items) - 1) / (n - 1)) for i in range(n)})
    return [items[i] for i in idxs]


def lesion_label(mappings: list[dict], vol_voxels: int) -> str:
    """A short human descriptor for the case picker, built ONLY from computed data.

    Region name comes from the top computed overlap (never guessed), size from the mask's
    own voxel count (1 mm isotropic, so voxels ~= cc). This is a UI convenience string,
    not a clinical claim; the grounded detail still lives in each mapping's provenance.
    """
    cc = vol_voxels / 1000.0
    if mappings:
        return f"{humanize(mappings[0]['region_id'])} · ~{cc:.0f} cc"
    return f"~{cc:.0f} cc lesion (no atlas overlap)"


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


# Case building is the expensive part of this pipeline (dipy affine registration to MNI152
# per tumor/stroke/hemorrhage case can take several minutes each). Raw datasets don't change
# during the project, so case_id -> output is stable across runs; skip rebuilding a case
# whose JSON is already on disk unless --force is passed. This is the same
# cache-if-output-exists pattern mni_parcellation.build_labelmap() already uses.
FORCE_REBUILD = False


def _cached_case(case_id: str) -> dict | None:
    """The already-built case JSON for case_id, or None if absent or --force was passed."""
    if FORCE_REBUILD:
        return None
    path = FIXTURES / "cases" / f"{case_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


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


TUMOR_LESION_VALUES = (1, 2, 4)  # necrotic core, edema, enhancing tumor -> merged extent


def _tumor_lesion_voxels(src_case: str) -> int:
    """Count merged-lesion voxels in a BraTS seg, for size-spread case selection."""
    import nibabel as nib

    seg = RAW / "tumor" / src_case / f"{src_case}_seg.nii.gz"
    data = np.asarray(nib.load(str(seg)).dataobj)
    return int(np.count_nonzero(np.isin(data, TUMOR_LESION_VALUES)))


def select_tumor_cases(n: int) -> list[tuple[str, str]]:
    """Pick n BraTS subjects spread across tumor size. Returns [(case_id, src_case)].

    Deterministic: score every downloaded subject by merged-lesion voxel count, sort, and
    spread-pick n so the demo spans a small focal tumor -> a large one. case_ids are
    assigned brats-001.. in ascending size order.
    """
    dirs = sorted(p.name for p in (RAW / "tumor").glob("BraTS2021_*") if p.is_dir())
    scored = sorted(((_tumor_lesion_voxels(d), d) for d in dirs), key=lambda s: (s[0], s[1]))
    picked = spread_pick(scored, n)
    return [(f"brats-{i + 1:03d}", src) for i, (_vol, src) in enumerate(picked)]


def build_tumor(case_id="brats-001", src_case="BraTS2021_00000") -> dict:
    cached = _cached_case(case_id)
    if cached is not None:
        print(f"tumor: {case_id} <- {src_case} (cached, skipping registration)")
        return cached
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
        base_src, mask_src, register=True, lesion_values=TUMOR_LESION_VALUES,
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
        "label": lesion_label(mappings, qc["lesion_voxels_in_mni"]),
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


# CHB-MIT chb01 seizure windows, from chb01-summary.txt (real annotations). All are the
# SAME patient (chb01, a known left-temporal-onset case), so the involved scalp chain is
# the same across them; what varies is the seizure episode and its timing -- honest
# multi-recording variety for a scalp-EEG disorder, not a spatial-focus claim. Only the
# EDFs actually on disk are built.
EPILEPSY_INVOLVED = ["F7-T7", "T7-P7"]  # left temporal chain (scalp-level, approximate)
EPILEPSY_CASES = [
    ("chbmit-01", "chb01_03.edf", 2996, 3036),
    ("chbmit-02", "chb01_04.edf", 1467, 1494),
    ("chbmit-03", "chb01_15.edf", 1732, 1772),
]


def select_epilepsy_cases(n: int) -> list[tuple[str, str, int, int]]:
    """The declared chb01 seizure windows whose EDF is present, capped at n."""
    present = [
        spec for spec in EPILEPSY_CASES
        if (RAW / "epilepsy" / "chb01" / spec[1]).exists()
    ]
    return present[:n]


def build_epilepsy(case_id="chbmit-01", edf_name="chb01_03.edf",
                   onset=2996, offset=3036) -> dict | None:
    cached = _cached_case(case_id)
    if cached is not None:
        print(f"epilepsy: {case_id} <- {edf_name} (cached)")
        return cached
    print(f"epilepsy: {case_id} <- {edf_name}")
    from edf_reader import Edf

    edf_path = RAW / "epilepsy" / "chb01" / edf_name
    pad = 10

    edf = Edf(str(edf_path))
    # This patient's left-temporal chain, restricted to channels actually in this montage
    # (CHB-MIT montages drift slightly between files). Skip the case if neither is present
    # rather than KeyError on a missing channel.
    involved = [ch for ch in EPILEPSY_INVOLVED if ch in edf.labels]
    if not involved:
        print(f"  skip {case_id}: none of {EPILEPSY_INVOLVED} in {edf_name} montage")
        return None
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

    mm, ss = divmod(onset, 60)
    case = {
        "case_id": case_id,
        "disorder_id": "epilepsy",
        "source_dataset": "CHB-MIT",
        "label": f"Seizure at {mm}:{ss:02d} · left temporal",
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
                "provenance": ("scalp-channel-level and approximate: channels "
                               f"{', '.join(involved)} overlie left temporal cortex; "
                               "not a localized brain focus"),
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


# OASIS-1 severity ladder for the Alzheimer's cases, coarsest atrophy first. Each is a
# different de-identified AD subject at a distinct Clinical Dementia Rating, paired with an
# age/sex-matched CDR 0 control -- so the demo shows the SEVERITY (intensity) gradient of
# atrophy, not just one case. Still a cross-sectional two-subject comparison, never a
# longitudinal same-patient pair (docs/MEDICAL_ACCURACY.md "the atrophy caveat").
AD_SEVERITY: list[tuple[float, str]] = [
    (2.0, "moderate"),
    (1.0, "mild"),
    (0.5, "very mild"),
]


def _cdr(r: dict) -> float:
    return float(r["CDR"])


def _age(r: dict) -> int:
    return int(r["Age"])


def _mmse(r: dict) -> float:
    return float(r["MMSE"]) if r.get("MMSE") else 99.0


def load_oasis_rows() -> list[dict]:
    """OASIS-1 rows that both have a CDR and a GM map present on disk."""
    import csv

    present = {p.name for p in OASIS_DIR.iterdir() if p.is_dir() and p.name.startswith("OAS1_")}
    rows = []
    with open(OASIS_CSV, newline="") as f:
        for r in csv.DictReader(f):
            if r["ID"] in present and r.get("CDR") not in ("", None) and gm_map_present(r["ID"]):
                rows.append(r)
    return rows


def gm_map_present(subject_id: str) -> bool:
    return bool(list((OASIS_DIR / subject_id).glob("mwrc1*.nii.gz")))


def select_oasis_pair(rows: list[dict], target_cdr: float,
                      used_ids: set[str]) -> tuple[dict, dict] | None:
    """Pick a (reference CDR 0, AD at target_cdr) pair, avoiding already-used subjects.

    Deterministic: the AD subject is the target-CDR case with the lowest MMSE (clearest
    atrophy), preferring female so the age/sex-matched control pool is larger; the
    reference is the same-sex CDR 0 subject closest in age. Returns None when either pool
    is empty (that severity simply isn't wired), so a thin OASIS extract still builds.
    """
    ad_pool = sorted((r for r in rows if _cdr(r) == target_cdr and r["ID"] not in used_ids),
                     key=lambda r: (r["M/F"] != "F", _mmse(r), r["ID"]))
    if not ad_pool:
        return None
    ad = ad_pool[0]

    ref_pool = sorted(
        (r for r in rows if _cdr(r) == 0.0 and r["M/F"] == ad["M/F"] and r["ID"] not in used_ids),
        key=lambda r: (abs(_age(r) - _age(ad)), r["ID"]))
    if not ref_pool:
        return None
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


def build_alzheimers_cases(n: int) -> list[dict]:
    """Build up to n Alzheimer's cases across the AD_SEVERITY ladder (CDR 2 -> 1 -> 0.5).

    Each severity that has a subject on disk becomes one case, oasis-001.. in that order,
    so the picker spans moderate -> very mild atrophy. Subjects are not reused across cases.
    """
    rows = load_oasis_rows()
    used: set[str] = set()
    cases: list[dict] = []
    for target_cdr, word in AD_SEVERITY:
        if len(cases) >= n:
            break
        pair = select_oasis_pair(rows, target_cdr, used)
        if pair is None:
            print(f"alzheimers: no unused CDR {target_cdr} subject on disk; skipping "
                  f"the '{word}' case")
            continue
        ref, ad = pair
        used.update({ref["ID"], ad["ID"]})
        cases.append(build_alzheimers(f"oasis-{len(cases) + 1:03d}", ref, ad, word))
    return cases


def build_alzheimers(case_id, ref: dict, ad: dict, severity: str) -> dict:
    """Cross-sectional atrophy evidence for Alzheimer's, from OASIS-1 VBM GM maps.

    HONESTY (docs/MEDICAL_ACCURACY.md "the atrophy caveat"): OASIS-1 ships no per-voxel
    atrophy mask and no same-patient longitudinal pair. So this is an honest cross-sectional
    comparison of TWO DIFFERENT de-identified subjects -- a CDR 0 reference and an AD case at
    the given CDR -- reusing the atrophy-pair renderer's baseline/followup slots (baseline =
    the CDR 0 reference, followup = the AD case). The affected-region set is the cited
    literature pattern (AD_PATTERN), never a segmentation of this scan. The "different
    subjects, not longitudinal" caveat is carried in every mapping's provenance and notes.
    """
    cached = _cached_case(case_id)
    if cached is not None:
        print(f"alzheimers: {case_id} ({severity}) <- reference {ref['ID']} vs case "
              f"{ad['ID']} (cached)")
        return cached
    print(f"alzheimers: {case_id} ({severity}) <- reference {ref['ID']} (CDR {ref['CDR']}, "
          f"{ref['M/F']}, {ref['Age']}y) vs case {ad['ID']} (CDR {ad['CDR']}, {ad['M/F']}, "
          f"{ad['Age']}y)")

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
        "label": f"CDR {int(float(ad['CDR'])) if float(ad['CDR']).is_integer() else ad['CDR']} "
                 f"({severity}) · {ad['M/F']}, {age_band(int(ad['Age']))}",
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


# --------------------------------------------------------------------------- #
# stroke (ATLAS v2.0) -- same lesion-overlay path as tumor, no registration
# --------------------------------------------------------------------------- #

def _stroke_t1_for_mask(mask_path: Path) -> Path | None:
    """The T1w sibling of an ATLAS lesion mask, if present.

    ATLAS is BIDS: the mask sits beside its T1w in the same anat/ dir, in whichever space
    the release ships. The exact-name rewrite covers the normalized release
    (..._space-MNI152NLin2009aSym_label-L_desc-T1lesion_mask.nii.gz next to
    ..._space-MNI152NLin2009aSym_T1w.nii.gz); the glob fallback covers the raw release,
    whose T1w carries an extra entity (..._space-orig_desc-brain_T1w.nii.gz).
    """
    exact = mask_path.parent / re.sub(
        r"(_label-[^_]+)?(_desc-[^_]+)?_mask\.nii\.gz$", "_T1w.nii.gz", mask_path.name)
    if exact.exists():
        return exact
    siblings = sorted(mask_path.parent.glob("*_T1w.nii.gz"))
    return siblings[0] if siblings else None


def _find_atlas_stroke_cases() -> list[tuple[str, Path, Path]]:
    """Discover extracted ATLAS subjects: (subject_id, t1w, mask).

    Recursive glob tolerates whatever cohort/site nesting the archive extracts into. Both
    releases match (the raw one is space-orig, the normalized one space-MNI152...); which
    one it is decides the overlap path, and that is read per-file by _space_of_mask rather
    than assumed here. The specific BIDS name is tried first, with a looser fallback for
    naming drift.
    """
    masks = sorted(STROKE_DIR.rglob("*desc-T1lesion_mask.nii.gz"))
    if not masks:
        masks = sorted(p for p in STROKE_DIR.rglob("*mask.nii.gz")
                       if "T1w" not in p.name)
    cases = []
    for m in masks:
        sub = re.match(r"(sub-[A-Za-z0-9]+)", m.name)
        t1 = _stroke_t1_for_mask(m)
        if sub and t1 and t1.exists():
            cases.append((sub.group(1), t1, m))
    return cases


def _space_of_mask(mask_path: Path) -> str:
    """The BIDS `space-` entity of an ATLAS file: "MNI" only for the normalized release.

    ATLAS ships two forms and they need opposite handling. The normalized release is
    `space-MNI152NLin2009aSym` and can be intersected with the atlas directly; the raw
    release is `space-orig` (native scanner space) and MUST be registered first. Reading
    the entity off the filename keeps that decision in the data rather than in a constant
    someone has to remember to flip when the download changes.
    """
    m = re.search(r"_space-([A-Za-z0-9]+)", mask_path.name)
    space = m.group(1) if m else "unknown"
    return "MNI" if space.upper().startswith("MNI") else space


def _score_stroke_cases(cases: list[tuple[str, Path, Path]]) -> list[tuple[int, str, Path, Path]]:
    """Attach a lesion voxel count to each (sub, t1, mask); sorted ascending by size."""
    import nibabel as nib

    scored = []
    for i, (sub, t1, m) in enumerate(cases):
        vol = int(np.count_nonzero(np.asarray(nib.load(str(m)).dataobj)))
        scored.append((vol, sub, t1, m))
        if (i + 1) % 100 == 0:
            print(f"  ...scanned {i + 1}/{len(cases)} lesion masks")
    return sorted(scored, key=lambda s: (s[0], s[1]))


def _diverse_by_size(scored: list, n: int, factor: float = 1.4) -> list:
    """Greedily pick n items whose sizes are genuinely different, not near-duplicates.

    `scored` is sorted ascending by voxel count (index 0). Take the smallest, then each next
    item at least `factor`x the last taken, so a cluster of same-size lesions (e.g. several
    ~15 cc subjects) contributes only one case and the picks actually span small -> large.
    If the growth rule yields fewer than n, top up from the rest by even spread.
    """
    picked, last = [], 0
    for s in scored:
        if not picked or s[0] >= factor * last:
            picked.append(s)
            last = s[0]
        if len(picked) >= n:
            break
    if len(picked) < n:
        rest = [s for s in scored if s not in picked]
        picked = sorted(picked + spread_pick(rest, n - len(picked)), key=lambda s: (s[0], s[1]))
    return picked[:n]


def select_stroke_cases(cases: list[tuple[str, Path, Path]], n: int
                        ) -> list[tuple[int, str, Path, Path]]:
    """Pick n demo lesions spread across size. Returns [(vol, sub, t1, mask)] small->large.

    Scores every extracted subject by lesion voxel count, keeps those in the legible
    territorial-lesion window [MIN, MAX] (falling back to all if that window is empty), then
    picks a size-diverse set so the picker spans a small focal infarct -> a large one, in
    whichever regions the real masks happen to hit. Deterministic.
    """
    scored = _score_stroke_cases(cases)
    in_range = [s for s in scored if STROKE_MIN_VOXELS <= s[0] <= STROKE_MAX_VOXELS]
    pool = in_range or scored
    return _diverse_by_size(pool, n)


def _resample_mask_to_labelgrid(mask_path: Path, labels_nii: Path, out_path: Path) -> str:
    """Put an already-MNI ATLAS mask on the exact labelmap grid; returns a provenance note.

    Only for the MNI-normalized ATLAS release. Such a mask is already in MNI152 space, but
    the specific MNI152 variant grid may differ from our labelmap's by a fraction of a
    voxel, and _load_mask_in_mni requires an exact grid match. We align by world coordinates
    (nearest-neighbour, so labels are preserved) onto the labelmap grid. When the grids
    already match this is a no-op copy. This resampled mask is used ONLY for the overlap
    math; the frontend still gets the ATLAS mask on its native T1w grid.
    """
    import nibabel as nib

    labels_img = nib.load(str(labels_nii))
    mask_img = nib.load(str(mask_path))
    same = (tuple(mask_img.shape[:3]) == tuple(labels_img.shape[:3])
            and np.allclose(mask_img.affine, labels_img.affine, atol=1e-3))
    if same:
        data = np.asarray(mask_img.dataobj)
        note = "already on the MNI152 labelmap grid (no resampling)"
    else:
        from nilearn.image import resample_to_img
        res = resample_to_img(mask_img, labels_img, interpolation="nearest")
        data = np.asarray(res.dataobj)
        note = ("nearest-neighbour resampled onto the MNI152 labelmap grid by world "
                "coordinates (both are MNI152; grids differ slightly between MNI152 variants)")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    nib.save(nib.Nifti1Image(data.astype(np.int16), labels_img.affine), str(out_path))
    return note


def build_strokes(n: int) -> list[dict]:
    """Wire up to n ischemic-stroke cases from ATLAS 3.0, spread across lesion size.

    Ischemic stroke reuses the tumor lesion-overlay path. The release in hand is
    "ATLAS3_Training_Raw", whose T1w and lesion masks are in NATIVE scanner space (BIDS
    `space-orig`), NOT the MNI-normalized release; each case is registered to MNI152 before
    the atlas overlap (see build_one_stroke). Region involvement is COMPUTED from the actual
    lesion mask (root CLAUDE.md golden rules 1-2), never guessed.

    Returns [] (ischemic-stroke stays unwired) when the ATLAS download has not been
    extracted yet, so `python3 backend/build_dataset.py` still runs today. Once the
    encrypted tarball is decrypted (key in data/raw/stroke/key.txt) and extracted under
    data/raw/stroke/, re-running wires the cases with no code change.
    """
    if not STROKE_DIR.exists():
        return []
    cases = _find_atlas_stroke_cases()
    if not cases:
        print("stroke: no extracted ATLAS data under data/raw/stroke yet; skipping "
              "(ischemic-stroke stays unwired). Decrypt + extract the download, then "
              "re-run build_dataset.py.")
        return []

    print(f"stroke: {len(cases)} ATLAS subject(s) found; selecting up to {n} demo lesions "
          f"spread across size")
    selected = select_stroke_cases(cases, n)
    built = []
    for i, (vol, sub, t1_src, mask_src) in enumerate(selected):
        built.append(build_one_stroke(f"atlas-{i + 1:03d}", vol, sub, t1_src, mask_src))
    return built


def build_one_stroke(case_id: str, vol: int, sub: str, t1_src: Path, mask_src: Path) -> dict:
    """One ATLAS ischemic-stroke case: ship the native T1w + mask, compute the atlas overlap.

    Do NOT switch this to register=False without checking the release: for these native
    images the brain sits tens of mm off the MNI brain, so a world-coordinate reslice alone
    produces confidently wrong regions. See _space_of_mask.
    """
    cached = _cached_case(case_id)
    if cached is not None:
        print(f"stroke: {case_id} <- {sub} (cached, skipping registration)")
        return cached
    print(f"stroke: {case_id} <- {sub}: lesion = {vol} voxels (~{vol / 1000:.1f} cc), "
          f"from {mask_src.name}")

    out = ASSETS / "cases" / case_id
    out.mkdir(parents=True, exist_ok=True)
    # Ship the ATLAS T1w + its mask on that same native grid, so the Niivue overlay in the
    # frontend aligns exactly. Only the overlap math needs MNI.
    shutil.copyfile(t1_src, out / "base.nii.gz")
    shutil.copyfile(mask_src, out / "mask.nii.gz")

    from lesion_overlap import compute_region_mappings

    # Which ATLAS release this is decides how the mask reaches MNI, so read it off the
    # file rather than assuming. Raw (space-orig) must be registered; only the normalized
    # release can be intersected directly, and then only after a grid-matching reslice.
    space = _space_of_mask(mask_src)
    lesion_note = (f"stroke lesion = ATLAS manual lesion segmentation ({sub}), "
                   f"BIDS space-{space.lower()}.")
    if space == "MNI":
        print("  mask space: MNI-normalized release -> no registration")
        from mni_parcellation import LABELS_NII

        grid_mask = DERIVED / f"{case_id}_mask_on_labelgrid.nii.gz"
        grid_note = _resample_mask_to_labelgrid(mask_src, LABELS_NII, grid_mask)
        overlap_base, overlap_mask = grid_mask, grid_mask  # base unused when register=False
        source_note = f"{lesion_note} Mask {grid_note}."
        moving_space = ""
    else:
        print(f"  mask space: {space} (native scanner) -> registering T1w to MNI152")
        overlap_base, overlap_mask = t1_src, mask_src
        source_note = (f"{lesion_note} The Training Raw release is not MNI-normalized, so "
                       f"the lesion reaches atlas space via its own T1w, not by assumption.")
        moving_space = "ATLAS 3.0 native scanner space (brain-extracted T1w)"

    mappings, qc = compute_region_mappings(
        overlap_base, overlap_mask,
        register=space != "MNI", lesion_values=None,
        moving_space=moving_space, source_note=source_note,
    )
    print(f"  overlap: {qc['regions_touched']} regions touched, primary={qc['primary']} "
          f"({qc['lesion_voxels_in_labelled_brain']}/{qc['lesion_voxels_in_mni']} "
          f"lesion voxels inside a labelled region)")

    case = {
        "case_id": case_id,
        "disorder_id": "ischemic-stroke",
        "source_dataset": "ATLAS 3.0",
        # Native ATLAS mask voxel count, not the MNI-warped count, is the true lesion size.
        "label": lesion_label(mappings, vol),
        # ATLAS's public release ships no per-subject de-identified age/sex we can cite,
        # so we invent nothing (root CLAUDE.md golden rule 1; backend CLAUDE.md meta rule).
        "anonymized_meta": {},
        "report_summary": "NEEDS_SOURCE",  # a clinical read is not ours to write; TODO(neuro-review)
        "evidence": {
            "renderer": "lesion-overlay",
            "base": f"/assets/cases/{case_id}/base.nii.gz",
            "mask": f"/assets/cases/{case_id}/mask.nii.gz",
            "mask_labels": {"1": "stroke lesion"},
        },
        "region_mappings": mappings,
        "review_status": "pending",
    }
    write_json_both(f"cases/{case_id}.json", case)
    return case


# --------------------------------------------------------------------------- #
# hemorrhagic stroke (CT-ICH) -- same lesion-overlay path, CT registered to MNI
# --------------------------------------------------------------------------- #

# Where the CT-ICH download can land. Two shapes are tolerated: the staging path the
# helper script uses (data/raw/hemorrhage/...) and a raw `wget -r` PhysioNet mirror
# (data/raw/physionet.org/files/ct-ich/<ver>/...). Both are searched for a ct_scans/
# dir beside a masks/ dir; data/raw is gitignored, so neither is ever committed.
HEMORRHAGE_ROOTS = [RAW / "hemorrhage", RAW / "physionet.org"]
HEMORRHAGE_MIN_VOXELS = 50  # exclude the dataset's no-bleed (normal) scans and trivial specks


def _find_hemorrhage_cases() -> list[tuple[str, Path, Path]]:
    """Discover staged CT-ICH subjects as (patient_id, ct_scan, mask).

    Searches every HEMORRHAGE_ROOTS location for a `ct_scans/` dir beside a `masks/`
    dir, so it works whether the data was staged by the helper script or pulled as a
    raw PhysioNet mirror. A scan counts only when its same-named mask exists;
    completeness/bleed filtering happens in build_hemorrhages, not here.
    """
    cases = []
    for root in HEMORRHAGE_ROOTS:
        if not root.exists():
            continue
        for ct_dir in sorted(root.rglob("ct_scans")):
            mask_dir = ct_dir.parent / "masks"
            if not mask_dir.is_dir():
                continue
            for scan in sorted(ct_dir.glob("*.nii*")):
                mask = mask_dir / scan.name
                if mask.exists():
                    cases.append((scan.stem, scan, mask))
    return cases


def _nifti_loads_fully(path: Path) -> bool:
    """True only if the whole image array can be read.

    Rejects a still-downloading, truncated NIfTI: its 352-byte header reads fine and
    reports a full shape, but reading the voxel data raises OSError once the file runs
    short. This is what keeps a partial `wget` mirror from producing garbage overlaps.
    """
    import nibabel as nib

    try:
        np.asarray(nib.load(str(path)).dataobj)
        return True
    except (OSError, EOFError, ValueError):
        return False


def _hemorrhage_voxels(mask_path: Path) -> int | None:
    """Non-zero bleed voxels in a mask, or None if the file can't be fully read.

    Forces a full array read so a truncated (still-downloading) mask is rejected rather
    than silently under-counted.
    """
    import nibabel as nib

    try:
        return int(np.count_nonzero(np.asarray(nib.load(str(mask_path)).dataobj)))
    except (OSError, EOFError, ValueError):
        return None


def build_hemorrhages(n: int) -> list[dict]:
    """Wire up to n hemorrhagic-stroke cases from CT-ICH (Hssayeni et al., 2020).

    Dormant until the DUA-gated download is staged under data/raw/hemorrhage (returns [],
    leaving hemorrhagic-stroke listed but unwired). CT-ICH ships CT + per-slice hemorrhage
    masks in native CT space, so each is registered to MNI152 (dipy affine, mutual
    information) before the atlas overlap -- the same grounded path as tumor/stroke, just
    cross-modality (CT -> T1 template). That registration is APPROXIMATE across modalities;
    it is labelled so in every mapping's provenance and everything ships pending review.

    NOTE(neuro-review): CT->MNI mutual-information registration has not been validated on
    this dataset yet; if regions look implausible when the data lands, tune the registration
    (e.g. intensity clipping of the CT to a brain window) before trusting the overlap.
    """
    cases = _find_hemorrhage_cases()
    if not cases:
        print("hemorrhage: no CT-ICH data under data/raw/{hemorrhage,physionet.org} yet; "
              "skipping (hemorrhagic-stroke stays listed but unwired). Sign the PhysioNet "
              "DUA, download, then re-run build_dataset.py.")
        return []

    # Keep only fully-downloaded pairs with a real bleed. A raw `wget` mirror is often
    # still in flight (truncated NIfTIs) and CT-ICH includes no-hemorrhage scans; both
    # are dropped here so a partial download simply leaves hemorrhagic-stroke unwired
    # rather than emitting garbage overlaps.
    scored = []
    skipped_partial = 0
    for pid, ct, m in cases:
        vol = _hemorrhage_voxels(m)
        if vol is None or not _nifti_loads_fully(ct):
            skipped_partial += 1
            continue
        if vol < HEMORRHAGE_MIN_VOXELS:
            continue
        scored.append((vol, pid, ct, m))
    if skipped_partial:
        print(f"hemorrhage: skipped {skipped_partial}/{len(cases)} still-downloading or "
              f"unreadable CT/mask pair(s)")
    if not scored:
        print("hemorrhage: no complete CT-ICH subject with a bleed yet; skipping "
              "(hemorrhagic-stroke stays listed but unwired). Re-run once the download finishes.")
        return []

    scored.sort(key=lambda s: (s[0], s[1]))
    selected = spread_pick(scored, n)
    print(f"hemorrhage: {len(scored)} complete CT-ICH subject(s) with a bleed; building "
          f"{len(selected)} spread across bleed size")
    built = []
    for i, (vol, pid, ct_src, mask_src) in enumerate(selected):
        built.append(build_one_hemorrhage(f"ctich-{i + 1:03d}", vol, pid, ct_src, mask_src))
    return built


def build_one_hemorrhage(case_id: str, vol: int, pid: str, ct_src: Path, mask_src: Path) -> dict:
    """One CT-ICH hemorrhage case: ship the CT + mask, compute the atlas overlap via CT->MNI."""
    cached = _cached_case(case_id)
    if cached is not None:
        print(f"hemorrhage: {case_id} <- patient {pid} (cached, skipping registration)")
        return cached
    print(f"hemorrhage: {case_id} <- patient {pid}: bleed = {vol} voxels, from {mask_src.name}")

    out = ASSETS / "cases" / case_id
    out.mkdir(parents=True, exist_ok=True)
    # Keep the mask on the CT's own grid for the frontend overlay; only the overlap needs MNI.
    shutil.copyfile(ct_src, out / "base.nii.gz")
    shutil.copyfile(mask_src, out / "mask.nii.gz")

    from lesion_overlap import compute_region_mappings

    source_note = (f"hemorrhage = CT-ICH manual hemorrhage segmentation (patient {pid}), "
                   f"native CT space. CT-ICH is not MNI-normalized, so the bleed reaches "
                   f"atlas space via its own CT; CT->T1-template registration is "
                   f"cross-modality and approximate (see NOTE(neuro-review) in build code).")
    mappings, qc = compute_region_mappings(
        ct_src, mask_src, register=True, lesion_values=None,
        moving_space="CT-ICH native scanner space (CT)", source_note=source_note,
    )
    print(f"  overlap: {qc['regions_touched']} regions touched, primary={qc['primary']} "
          f"({qc['lesion_voxels_in_labelled_brain']}/{qc['lesion_voxels_in_mni']} "
          f"bleed voxels inside a labelled region)")

    case = {
        "case_id": case_id,
        "disorder_id": "hemorrhagic-stroke",
        "source_dataset": "CT-ICH",
        "label": lesion_label(mappings, vol),
        # CT-ICH ships de-identified age/sex in Patient_demographics.csv; wired when the data
        # lands and the exact column names are confirmed (TODO(neuro-review)).
        "anonymized_meta": {},
        "report_summary": "NEEDS_SOURCE",
        "evidence": {
            "renderer": "lesion-overlay",
            "base": f"/assets/cases/{case_id}/base.nii.gz",
            "mask": f"/assets/cases/{case_id}/mask.nii.gz",
            "mask_labels": {"1": "hemorrhage"},
        },
        "region_mappings": mappings,
        "review_status": "pending",
    }
    write_json_both(f"cases/{case_id}.json", case)
    return case


def build_disorders(cases_by_disorder: dict[str, list[dict]]):
    """cases_by_disorder maps disorder_id -> the built case dicts (in picker order).

    Each disorder carries both `case_ids` (the join key the validator checks) and a
    parallel `cases` list of {case_id, label} so the frontend picker can show a descriptive
    label per case without fetching every case JSON. `cases` is an additive, optional field
    (docs/DATA_CONTRACT.md); the validator ignores it.
    """
    def cids(key: str) -> list[str]:
        return [c["case_id"] for c in cases_by_disorder.get(key, [])]

    def clabels(key: str) -> list[dict]:
        return [{"case_id": c["case_id"], "label": c.get("label", c["case_id"])}
                for c in cases_by_disorder.get(key, [])]

    disorders = [
        {"disorder_id": "glioma", "name": "Glioma (brain tumor)", "category": "structural",
         "evidence_renderer": "lesion-overlay", "case_ids": cids("glioma"),
         "cases": clabels("glioma")},
        {"disorder_id": "ischemic-stroke", "name": "Ischemic stroke", "category": "structural",
         "evidence_renderer": "lesion-overlay", "case_ids": cids("ischemic-stroke"),
         "cases": clabels("ischemic-stroke")},
        {"disorder_id": "hemorrhagic-stroke", "name": "Hemorrhagic stroke", "category": "structural",
         "evidence_renderer": "lesion-overlay", "case_ids": cids("hemorrhagic-stroke"),
         "cases": clabels("hemorrhagic-stroke")},
        {"disorder_id": "epilepsy", "name": "Epilepsy (seizure)", "category": "functional",
         "evidence_renderer": "eeg", "case_ids": cids("epilepsy"),
         "cases": clabels("epilepsy")},
        {"disorder_id": "alzheimers", "name": "Alzheimer's disease", "category": "neurodegenerative",
         "evidence_renderer": "atrophy-pair", "case_ids": cids("alzheimers"),
         "cases": clabels("alzheimers")},
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
    wired = [d["disorder_id"] for d in out if d["case_ids"]]
    print(f"disorders.json: {len(out)} disorders (wired: {', '.join(wired)})")


def main():
    global FORCE_REBUILD
    FORCE_REBUILD = "--force" in sys.argv[1:]
    if FORCE_REBUILD:
        print("--force: ignoring cached case JSON, rebuilding every case from raw data")

    build_atlas()

    tumors = [build_tumor(cid, src) for cid, src in select_tumor_cases(N_TUMOR_CASES)]

    epilepsy = [c for c in
                (build_epilepsy(cid, edf, on, off)
                 for cid, edf, on, off in select_epilepsy_cases(3))
                if c is not None]

    alzheimers = build_alzheimers_cases(3)

    # None until the ATLAS download is decrypted + extracted / CT-ICH DUA download is staged.
    strokes = build_strokes(N_STROKE_CASES)
    hemorrhages = build_hemorrhages(N_HEMORRHAGE_CASES)

    build_disorders({
        "glioma": tumors,
        "ischemic-stroke": strokes,
        "hemorrhagic-stroke": hemorrhages,
        "epilepsy": epilepsy,
        "alzheimers": alzheimers,
    })
    print("\ndone. JSON -> contract/fixtures + frontend/public/data ; "
          "assets -> frontend/public/assets")


if __name__ == "__main__":
    main()
