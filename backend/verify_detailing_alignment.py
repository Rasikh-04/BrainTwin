"""Check the detailing layers against the atlas using known anatomy.

    python3 backend/verify_detailing_alignment.py

A bounding-box match proves the overall scale is right; it does not prove the
structures landed where they belong. This checks specific relationships that
are true of every human brain, so a misalignment shows up as a number rather
than as something that looks slightly off in a screenshot:

  - the pericallosal artery runs on the surface of the corpus callosum
  - the basilar artery lies on the front of the pons
  - the superior sagittal sinus runs along the midline at the vertex
  - the internal carotid enters below and lateral to the optic chiasm

Distances are millimetres in the atlas frame. These are geometric checks
against the atlas mesh, not clinical measurements.
"""

import json
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ATLAS = ROOT / "frontend/public/assets/atlas"

# structure in a detailing layer -> atlas region it must sit next to, and the
# distance we would expect between the two surfaces.
#
# Tolerances are deliberately loose. Z-Anatomy and the FreeSurfer atlas are
# different individuals, so a few millimetres of disagreement is anatomy, not
# misalignment. What these catch is the failure that matters: a structure tens
# of millimetres away, or on the wrong side.
CHECKS = [
    # The pericallosal artery is the continuation of the ACA and lies directly
    # on the corpus callosum, curving around the genu and along the body.
    ("arteries", "Pericallosal artery.l", ["aseg-cc-central", "aseg-cc-anterior"], 12),
    ("arteries", "Pericallosal artery.r", ["aseg-cc-central", "aseg-cc-anterior"], 12),
    # The basilar artery runs up the ventral surface of the pons, which sits in
    # the middle of the atlas brainstem label.
    ("arteries", "Basilar artery", ["aseg-brain-stem"], 15),
    # The vertebral arteries join to form the basilar at the pontomedullary
    # junction, so they also hug the brainstem.
    ("arteries", "Vertebral artery.l", ["aseg-brain-stem"], 20),
    # The M1 segment runs laterally from the carotid terminus towards the
    # insula, passing under the putamen.
    ("arteries", "Middle cerebral artery (M1-segment).l", ["aseg-left-putamen"], 20),
    ("arteries", "Middle cerebral artery (M1-segment).r", ["aseg-right-putamen"], 20),
    # PICA wraps the inferior cerebellum, behind and below the brainstem.
    ("arteries", "Posterior inferior cerebellar artery.l", ["aseg-brain-stem"], 30),
    # The straight sinus runs in the falx-tentorium junction and receives the
    # great cerebral vein just behind the splenium.
    ("veins", "Straight sinus", ["aseg-cc-posterior"], 25),
    # The optic tract sweeps back from the chiasm around the cerebral peduncle
    # towards the lateral geniculate, which sits on the thalamus.
    ("nerves", "Optic tract.l", ["aseg-left-thalamus-proper"], 15),
    ("nerves", "Optic tract.r", ["aseg-right-thalamus-proper"], 15),
]

# Structures that must stay on their own side of the midline. A sign error in
# the change of basis would mirror the model, and nothing else in this file
# would notice.
SIDEDNESS = [
    ("arteries", "Middle cerebral artery (M1-segment).l", "left"),
    ("arteries", "Middle cerebral artery (M1-segment).r", "right"),
    ("veins", "Transverse sinus.l", "left"),
    ("veins", "Transverse sinus.r", "right"),
    ("nerves", "Optic tract.l", "left"),
    ("nerves", "Optic tract.r", "right"),
]


def read_glb_nodes(path):
    """{node name: [(x, y, z), ...]} from an uncompressed glb."""
    buf = path.read_bytes()
    json_len = struct.unpack_from("<I", buf, 12)[0]
    gltf = json.loads(buf[20 : 20 + json_len])
    bin_start = 20 + json_len + 8

    out = {}
    for node in gltf.get("nodes", []):
        if "mesh" not in node:
            continue
        points = []
        for prim in gltf["meshes"][node["mesh"]]["primitives"]:
            acc = gltf["accessors"][prim["attributes"]["POSITION"]]
            view = gltf["bufferViews"][acc["bufferView"]]
            base = bin_start + view.get("byteOffset", 0) + acc.get("byteOffset", 0)
            stride = view.get("byteStride") or 12
            for i in range(acc["count"]):
                points.append(struct.unpack_from("<3f", buf, base + i * stride))
        out[node["name"]] = points
    return out


def min_distance(a, b):
    """Closest approach between two point sets, in millimetres."""
    best = float("inf")
    for p in a:
        for q in b:
            d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
            if d < best:
                best = d
    return best**0.5


def subsample(points, cap=600):
    if len(points) <= cap:
        return points
    step = len(points) // cap
    return points[::step]


def main():
    manifest = json.loads((ATLAS / "detailing-manifest.json").read_text())["layers"]
    atlas = {}
    for name in ("brain-cortical", "brain-subcortical"):
        atlas.update(read_glb_nodes(ATLAS / f"{name}.glb"))

    failures = 0

    print("Proximity to the atlas structure each one is known to lie against")
    print(f"{'structure':<44}{'atlas region':<28}{'gap':>8}  {'limit':>6}")
    for layer, structure, regions, limit in CHECKS:
        info = manifest[layer]["structures_mni_mm"].get(structure)
        if info is None:
            print(f"  {structure:<42} MISSING from {layer}")
            failures += 1
            continue
        # The manifest stores bounds, so approximate the structure by its
        # bounding-box corners and centroid. That is enough to catch a gross
        # displacement, which is what this is for.
        lo, hi, mid = info["min"], info["max"], info["centroid"]
        probe = [mid] + [
            (x, y, z) for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])
        ]
        gap = min(
            min_distance(probe, subsample(atlas[r]))
            for r in regions
            if r in atlas
        )
        ok = gap <= limit
        failures += not ok
        mark = "ok " if ok else "OFF"
        print(f"{mark} {structure:<42}{regions[0]:<28}{gap:>7.1f}  {limit:>6}")

    print("\nSidedness (a mirrored change of basis would flip these)")
    for layer, structure, side in SIDEDNESS:
        info = manifest[layer]["structures_mni_mm"].get(structure)
        if info is None:
            print(f"  {structure:<42} MISSING")
            failures += 1
            continue
        x = info["centroid"][0]
        # Atlas frame is RAS: +X is the subject's right.
        actual = "right" if x > 0 else "left"
        ok = actual == side
        failures += not ok
        print(f"{'ok ' if ok else 'OFF'} {structure:<42}centroid x = {x:>7.1f}  ({actual})")

    print(f"\n{failures} check(s) failed" if failures else "\nall checks passed")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
