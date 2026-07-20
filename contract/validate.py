"""Contract validator. Red blocks merge (run in CI on every pull request).

Checks the wired dataset against docs/DATA_CONTRACT.md:
  - regions.json shape, unique ids, enum fields, NEEDS_SOURCE pairing
  - glb node names == regions.json region_ids, both directions
  - disorders.json enum + case_ids resolve to real case files
  - each case: disorder_id exists, evidence.renderer matches the disorder's,
    every mapped region_id exists, lesion mappings carry overlap + provenance
  - no invented prose where a NEEDS_SOURCE marker belongs

Asset-file existence is checked only with --check-assets, because patient-derived
assets are intentionally kept out of git (see .gitignore). CI runs without the flag
and validates structure/ids; a developer runs --check-assets locally after building.

Usage:
  python3 contract/validate.py                 # structural, from frontend/public
  python3 contract/validate.py --check-assets  # also verify asset files exist on disk
  python3 contract/validate.py --root <dir>    # <dir> holds data/ and assets/
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ATLAS_SOURCES = {"desikan-killiany", "aseg", "aal"}
STRUCTURE_TYPES = {"cortical", "subcortical"}
HEMISPHERES = {"left", "right", "midline"}
RENDERERS = {"lesion-overlay", "atrophy-pair", "eeg"}
ROLES = {"primary", "secondary"}

errors: list[str] = []
notes: list[str] = []


def err(msg: str):
    errors.append(msg)


def load_json(p: Path):
    if not p.exists():
        err(f"missing file: {p}")
        return None
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError as e:
        err(f"invalid JSON in {p}: {e}")
        return None


def glb_node_names(path: Path) -> set[str]:
    if not path.exists():
        err(f"missing glb: {path}")
        return set()
    from pygltflib import GLTF2
    g = GLTF2().load(str(path))
    return {n.name for n in g.nodes if n.name}


def check_source_pairing(kind: str, ident: str, value, source):
    """A description field is either the literal NEEDS_SOURCE, or non-empty with a source."""
    if value == "NEEDS_SOURCE":
        return
    if not value:
        err(f"{kind} {ident}: description is blank; expected NEEDS_SOURCE or cited text")
    elif not source:
        err(f"{kind} {ident}: has prose but description_source is null (uncited content)")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=None, help="dir containing data/ and assets/")
    ap.add_argument("--check-assets", action="store_true")
    args = ap.parse_args()

    root = Path(args.root) if args.root else Path(__file__).resolve().parent.parent / "frontend" / "public"
    data = root / "data"
    assets = root / "assets"

    regions = load_json(data / "regions.json")
    disorders = load_json(data / "disorders.json")
    if regions is None or disorders is None:
        return finish()

    # --- regions ---
    region_ids: set[str] = set()
    for r in regions:
        rid = r.get("region_id")
        if not rid:
            err("region with no region_id")
            continue
        if rid in region_ids:
            err(f"duplicate region_id: {rid}")
        region_ids.add(rid)
        if r.get("atlas_source") not in ATLAS_SOURCES:
            err(f"region {rid}: bad atlas_source {r.get('atlas_source')!r}")
        if r.get("structure_type") not in STRUCTURE_TYPES:
            err(f"region {rid}: bad structure_type {r.get('structure_type')!r}")
        if r.get("hemisphere") not in HEMISPHERES:
            err(f"region {rid}: bad hemisphere {r.get('hemisphere')!r}")
        if r.get("review_status") != "pending":
            err(f"region {rid}: review_status must be 'pending' (code never sets reviewed)")
        check_source_pairing("region", rid, r.get("normal_function_description"), r.get("description_source"))

    # --- glb node names == region_ids, both ways ---
    node_names = glb_node_names(assets / "atlas" / "brain-cortical.glb")
    node_names |= glb_node_names(assets / "atlas" / "brain-subcortical.glb")
    for missing in sorted(node_names - region_ids):
        err(f"glb node '{missing}' has no regions.json entry")
    for missing in sorted(region_ids - node_names):
        err(f"regions.json id '{missing}' has no glb node")

    # --- disorders ---
    disorder_ids: set[str] = set()
    disorder_renderer: dict[str, str] = {}
    for d in disorders:
        did = d.get("disorder_id")
        if not did:
            err("disorder with no disorder_id")
            continue
        disorder_ids.add(did)
        rend = d.get("evidence_renderer")
        disorder_renderer[did] = rend
        if rend not in RENDERERS:
            err(f"disorder {did}: bad evidence_renderer {rend!r}")
        if d.get("review_status") != "pending":
            err(f"disorder {did}: review_status must be 'pending'")
        check_source_pairing("disorder", did, d.get("description"), d.get("description_source"))
        for tr in d.get("typical_affected_regions", []):
            if tr.get("region_id") not in region_ids:
                err(f"disorder {did}: typical region '{tr.get('region_id')}' not in regions.json")
            if not tr.get("source"):
                err(f"disorder {did}: typical region '{tr.get('region_id')}' has no source citation")
        for cid in d.get("case_ids", []):
            if not (data / "cases" / f"{cid}.json").exists():
                err(f"disorder {did}: case_id '{cid}' has no cases/{cid}.json")

    # --- cases ---
    for case_path in sorted((data / "cases").glob("*.json")):
        c = load_json(case_path)
        if c is None:
            continue
        cid = c.get("case_id", case_path.stem)
        did = c.get("disorder_id")
        if did not in disorder_ids:
            err(f"case {cid}: disorder_id '{did}' not in disorders.json")
        ev = c.get("evidence", {})
        if did in disorder_renderer and ev.get("renderer") != disorder_renderer[did]:
            err(f"case {cid}: evidence.renderer {ev.get('renderer')!r} != disorder renderer "
                f"{disorder_renderer[did]!r}")
        if c.get("review_status") != "pending":
            err(f"case {cid}: review_status must be 'pending'")
        check_source_pairing("case", cid, c.get("report_summary"), c.get("report_summary_source"))

        for m in c.get("region_mappings", []):
            mrid = m.get("region_id")
            if mrid not in region_ids:
                err(f"case {cid}: mapping region_id '{mrid}' not in regions.json")
            if m.get("role") not in ROLES:
                err(f"case {cid}: mapping '{mrid}' bad role {m.get('role')!r}")
            if not m.get("provenance"):
                err(f"case {cid}: mapping '{mrid}' has no provenance")
            if m.get("evidence_type") == "segmentation_mask" and not m.get("overlap_metric"):
                err(f"case {cid}: lesion mapping '{mrid}' needs a computed overlap_metric")

        if args.check_assets:
            for key in ("base", "mask", "baseline", "followup", "spectrogram", "waveform"):
                val = ev.get(key)
                if isinstance(val, str) and val.startswith("/assets/"):
                    ap_ = assets / val[len("/assets/"):]
                    if not ap_.exists():
                        err(f"case {cid}: referenced asset {val} not found at {ap_}")

    if not args.check_assets:
        notes.append("asset-file existence NOT checked (run --check-assets locally; "
                     "patient-derived assets are git-ignored by design)")
    return finish()


def finish() -> int:
    for n in notes:
        print(f"NOTE: {n}")
    if errors:
        print(f"\nFAIL: {len(errors)} contract violation(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    print("\nPASS: contract is self-consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
