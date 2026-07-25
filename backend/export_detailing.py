"""Export the vessel and cranial-nerve detailing layers from Z-Anatomy.

    blender --background --python backend/export_detailing.py

Reads the Z-Anatomy FBX models under `backend/assets_raw/`, keeps only the
intracranial structures for each layer (see `detailing_selection.py`), clips
them to the cranial cavity, aligns them into the atlas's MNI millimetre frame,
and writes one glb per layer into `frontend/public/assets/atlas/`, plus a
manifest recording exactly which source objects went into each file.

Everything here is offline precompute, per golden rule 5. The frontend loads
the resulting glb and does nothing but render it.
"""

import json
import sys
from pathlib import Path

import bmesh
import bpy

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from detailing_selection import (  # noqa: E402
    LAYERS,
    MIN_VERTS,
    SCALE,
    TRANSLATION,
    is_intracranial,
    matches,
)

FBX_DIR = ROOT / "backend/assets_raw/Z-Anatomy/Resources/Models/FBX"
SOURCES = {
    "cardio": FBX_DIR / "CardioVascular41.fbx",
    "nerves": FBX_DIR / "NervousSystem100.fbx",
}
OUT_DIR = ROOT / "frontend/public/assets/atlas"

# Vertex budget per layer. The cortical atlas is ~80k vertices, so a detailing
# overlay that costs more than the brain it decorates is the wrong trade.
VERTEX_BUDGET = 60_000


def import_source(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    print(f"[import] {path.name}")
    bpy.ops.import_scene.fbx(filepath=str(path))


def wants(obj, spec):
    """Both gates from detailing_selection, applied to a live Blender object.

    Assumes `flatten_transforms` has already run, so vertex coordinates are
    world coordinates.
    """
    if obj.type != "MESH" or len(obj.data.vertices) < MIN_VERTS:
        return False
    if not matches(obj.name, spec):
        return False
    co = [v.co for v in obj.data.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]
    hi = [max(c[i] for c in co) for i in range(3)]
    return is_intracranial(lo, hi, spec["clip"])


def keep_only(spec):
    """Delete every object that is not part of this layer. Returns kept names."""
    kept = []
    bpy.ops.object.select_all(action="DESELECT")
    for obj in list(bpy.data.objects):
        if wants(obj, spec):
            kept.append(obj.name)
        else:
            obj.select_set(True)
    bpy.ops.object.delete()
    return sorted(kept)


def flatten_transforms():
    """Bake object transforms into vertex data so mesh coords are world coords.

    This must run on the whole imported scene *before* anything is deleted.
    Z-Anatomy parents its anatomy under system-level empties, and those empties
    carry real transform. Deleting them first (they match no layer, so a naive
    filter removes them) leaves each surviving child holding only its local
    matrix, which silently teleports the entire selection to the wrong place --
    the basilar artery lands at z 0.05 m instead of z 1.58 m, and the cranial
    clip box then discards everything.

    Parents are cleared with CLEAR_KEEP_TRANSFORM so the parent's contribution
    is folded into each child before the empties go away.
    """
    bpy.ops.object.select_all(action="SELECT")
    bpy.context.view_layer.objects.active = bpy.data.objects[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")

    bpy.ops.object.select_all(action="DESELECT")
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    # The nervous-system model mirrors left to right by sharing one mesh
    # datablock between the .l and .r objects and flipping the object matrix.
    # transform_apply refuses to bake into multi-user data and aborts the whole
    # operation, not just the shared objects, so every object silently keeps its
    # untransformed coordinates. Give each object its own copy first.
    bpy.ops.object.make_single_user(object=True, obdata=True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def clip_to_cranium(obj, clip):
    """Cut the mesh down to the given cavity box, in Z-Anatomy metres.

    Six plane bisects rather than a vertex-distance delete, so the structures
    that leave the skull end in a flat cut face instead of a torn fringe of
    half-triangles.
    """
    mesh = obj.data
    bm = bmesh.new()
    bm.from_mesh(mesh)

    lo, hi = clip
    planes = [
        ((lo[0], 0, 0), (1, 0, 0)),
        ((hi[0], 0, 0), (-1, 0, 0)),
        ((0, lo[1], 0), (0, 1, 0)),
        ((0, hi[1], 0), (0, -1, 0)),
        ((0, 0, lo[2]), (0, 0, 1)),
        ((0, 0, hi[2]), (0, 0, -1)),
    ]
    for co, no in planes:
        geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
        if not geom:
            break
        # Each plane's normal points *into* the box, so the geometry to keep is
        # on the positive side. bmesh calls that side "outer", which makes
        # `clear_inner` the one that discards what falls outside the cranium.
        bmesh.ops.bisect_plane(
            bm, geom=geom, plane_co=co, plane_no=no, clear_inner=True
        )

    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    return len(mesh.vertices)


def align_to_mni(obj):
    """Z-Anatomy metres -> atlas MNI millimetres, applied to the vertex data."""
    for vert in obj.data.vertices:
        x, y, z = vert.co
        vert.co = (
            -x * SCALE + TRANSLATION[0],
            -y * SCALE + TRANSLATION[1],
            z * SCALE + TRANSLATION[2],
        )
    obj.data.update()


def join_all(name):
    objs = [o for o in bpy.data.objects if o.type == "MESH" and o.data.vertices]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for obj in objs:
        obj.select_set(True)
        obj.data.materials.clear()
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    merged = bpy.context.view_layer.objects.active
    merged.name = name
    merged.data.name = name
    return merged


def decimate(obj, budget):
    count = len(obj.data.vertices)
    if count <= budget:
        return count, 1.0
    ratio = budget / count
    mod = obj.modifiers.new("decimate", "DECIMATE")
    mod.ratio = ratio
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return len(obj.data.vertices), ratio


def bounds(obj):
    co = [v.co for v in obj.data.vertices]
    return {
        "min": [round(min(c[i] for c in co), 2) for i in range(3)],
        "max": [round(max(c[i] for c in co), 2) for i in range(3)],
        "centroid": [round(sum(c[i] for c in co) / len(co), 2) for i in range(3)],
    }


def export(obj, path):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format="GLB",
        use_selection=True,
        # The atlas glbs hold raw MNI coordinates (Z superior) and the scene
        # graph applies the Z-up to Y-up rotation once, for every layer. Letting
        # the exporter do its own Y-up conversion here would rotate these layers
        # twice.
        export_yup=False,
        export_apply=True,
        export_materials="NONE",
        # No Draco: this Blender build ships without libdraco, and the existing
        # atlas glbs are uncompressed too, so the loader path stays identical.
        export_draco_mesh_compression_enable=False,
    )


def build_layer(layer, spec, manifest):
    print(f"\n=== {layer}")
    import_source(SOURCES[spec["source"]])
    flatten_transforms()
    kept = keep_only(spec)
    print(f"[select] {len(kept)} objects")
    if not kept:
        raise SystemExit(f"{layer}: selection matched nothing")

    before = 0
    for obj in list(bpy.data.objects):
        if obj.type != "MESH":
            continue
        before += len(obj.data.vertices)
        if clip_to_cranium(obj, spec["clip"]) == 0:
            bpy.data.objects.remove(obj, do_unlink=True)

    survivors = [o for o in bpy.data.objects if o.type == "MESH"]
    clipped = sum(len(o.data.vertices) for o in survivors)
    print(f"[clip]   {before} -> {clipped} verts ({len(survivors)} objects survive)")

    for obj in survivors:
        align_to_mni(obj)

    # Per-structure coordinates, captured before the join collapses the layer
    # into one mesh. This is what makes the alignment reviewable: a reader can
    # check that the basilar artery sits on the front of the brainstem and that
    # the pericallosal artery follows the corpus callosum, against the atlas's
    # own region coordinates, without opening a 3D viewer.
    structures = {
        obj.name: bounds(obj) for obj in sorted(survivors, key=lambda o: o.name)
    }

    merged = join_all(layer)
    if merged is None:
        raise SystemExit(f"{layer}: nothing survived the cranial clip box")
    final, ratio = decimate(merged, VERTEX_BUDGET)
    box = bounds(merged)
    print(f"[mesh]   {final} verts (decimate ratio {ratio:.2f})")
    print(f"[bounds] MNI mm {box['min']} .. {box['max']}")

    out = OUT_DIR / f"brain-{layer}.glb"
    export(merged, out)
    print(f"[write]  {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")

    manifest[layer] = {
        "source_file": SOURCES[spec["source"]].name,
        "vertices": final,
        "decimate_ratio": round(ratio, 4),
        "bounds_mni_mm": box,
        "structures_mni_mm": structures,
    }


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {
        "note": (
            "Generated by backend/export_detailing.py. Geometry is Z-Anatomy "
            "(CC-BY-SA 4.0), clipped to the cranial cavity and aligned into MNI "
            "millimetres. Coordinates are atlas-frame, not patient measurements."
        ),
        "alignment": {
            "scale": SCALE,
            "rotation": "180 degrees about Z (Z-Anatomy +X left/+Y posterior -> MNI +X right/+Y anterior)",
            "translation_mm": list(TRANSLATION),
        },
        "layers": {},
    }
    for layer, spec in LAYERS.items():
        build_layer(layer, spec, manifest["layers"])

    path = OUT_DIR / "detailing-manifest.json"
    path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"\n[write]  {path.relative_to(ROOT)}")


main()
