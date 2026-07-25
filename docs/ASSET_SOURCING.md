# Asset sourcing: vessels and nerves (detailing layers)

This documents where the vessel and cranial-nerve meshes come from, and how they
become the glbs the frontend detailing layers load.

Status: done and reproducible. `backend/export_detailing.py` builds all three
layers from the downloaded source in one headless Blender run, and
`backend/verify_detailing_alignment.py` checks the result against the atlas. The
layer toggles are live.

Why this is a separate step, not something baked in the last session: the brain
in your `Brain_reference_anatomy.jpeg` reference is from **Visible Body / Human
Anatomy Atlas**, which is proprietary. Those exact meshes cannot be reused. Free,
openly-licensed vessel and nerve meshes exist, but none of them ship registered
to the MNI atlas space our brain meshes use, so each source needs a manual
alignment pass. That alignment is the real work here.

## Recommended source: Z-Anatomy (one coherent atlas, all three layers)

- Project: https://www.z-anatomy.com/
- Code / meshes: https://github.com/LluisV/Z-Anatomy. Note that despite the name,
  the repo ships its geometry as **FBX**, under
  `Resources/Models/FBX/`. The only `.blend` files in it are French text
  definitions and a label script, and neither contains geometry. Objects are
  named with real anatomical terms (`Basilar artery`, `Optic nerve (II).l`),
  which is what makes the selection scriptable.
- License: CC-BY-SA 4.0 (attribution + share-alike). Safe to redistribute the
  derived glbs **if** we keep the attribution and license. This matters because
  our atlas glbs are already CC-licensed and committed; the vessel glbs would be
  too, so unlike the patient case assets they do **not** need to be git-ignored.

Z-Anatomy is derived from BodyParts3D and gives one consistent coordinate frame
across all three layers, which is why it is the first choice: align it once and
all three detailing layers line up together.

### Turning it into our glbs

```
bash backend/download_detailing_assets.sh          # resumable, pulls the source
blender --background --python backend/export_detailing.py
python3 backend/verify_detailing_alignment.py
```

The exporter writes `brain-arteries.glb`, `brain-veins.glb`, `brain-nerves.glb`
and `detailing-manifest.json` into `frontend/public/assets/atlas/`. What it does
per layer: pick the intracranial objects by anatomical name, clip them to the
cranial cavity, rotate and scale into the atlas frame, merge, decimate to the
vertex budget, export.

Which objects belong to which layer lives in `backend/detailing_selection.py`,
as commented name patterns rather than a hand-picked list, so the choice is
reviewable without opening Blender. The manifest records the per-structure
coordinates that came out, which is what a reviewer checks.

Note the exporter passes `export_yup=False`. The atlas glbs store raw MNI
coordinates with Z superior, and `AtlasCanvas` applies the Z-up to Y-up rotation
once for every layer; letting the glTF exporter also convert would rotate these
layers twice.

### Alignment

Z-Anatomy is a whole standing body in metres, oriented +X left, +Y posterior,
+Z superior. The atlas is millimetres in MNI RAS, +X right, +Y anterior, +Z
superior. So the change of basis is a 180 degree rotation about Z (a proper
rotation, not a mirror) plus a scale and a translation.

The scale is exactly 1000. Z-Anatomy is modelled at true anatomical size, and
its cerebral bounding box agrees with the atlas to about one percent on the two
directly comparable axes (137.8 against 138.7 mm left-right, 117.8 against
119.2 mm superoinferior). The translation is then whatever puts the two cerebral
bounding-box centres together. Both constants are in `detailing_selection.py`.

Bounding boxes only prove the scale. `verify_detailing_alignment.py` checks
placement, using relationships that hold in every human brain: the pericallosal
artery runs on the corpus callosum, the basilar artery lies on the front of the
pons, the M1 segment passes under the putamen, the optic tract reaches the
thalamus. It also asserts sidedness, since a sign error in the change of basis
would mirror the model and nothing else would notice. Tolerances are loose on
purpose: Z-Anatomy and the FreeSurfer atlas are different individuals, so a few
millimetres of disagreement is anatomy rather than misalignment.

### What is actually in each layer

- **Arteries** — the cerebral arterial tree: internal carotid and vertebral
  inflow, the circle of Willis, the anterior, middle and posterior cerebral
  arteries with their named cortical branches, and the posterior fossa arteries
  (PICA, AICA, superior cerebellar).
- **Dural sinuses** — labelled that way, not "veins", because Z-Anatomy's
  cardiovascular model contains **no cerebral veins at all**: no great cerebral
  vein, no internal cerebral vein, no basal vein, no cortical or anastomotic
  veins. Only the dural sinuses, the basilar plexus and the jugulars. Calling
  the layer "Veins" would claim a cerebral venous anatomy that is not in the
  mesh. Adding real cerebral veins needs a different source.
- **Cranial nerves** — the twelve cranial nerves at their brainstem attachment
  and cisternal course, clipped at the skull base. Their peripheral
  distribution is deliberately excluded; the trigeminal divisions alone are
  another organ's worth of face geometry.

The two clip boxes differ for that reason, and both are documented with the
measurements they came from in `detailing_selection.py`.

## Alternative sources

- **BodyParts3D / Anatomography** (DBCLS): https://lifesciencedb.jp/bp3d/ —
  per-structure OBJ by FMA ID, CC-BY-SA 2.1 Japan. Z-Anatomy is built from this;
  use it directly only if you want a specific structure Z-Anatomy lacks.
- **NIH 3D**: https://3d.nih.gov/ — search "circle of Willis", "cerebral
  vasculature", "cranial nerves". Many models are CC0 / public domain. Quality
  and coordinate frame vary per upload, so this is best for a single hero vessel
  (e.g. the arteries) rather than a matched set.

## How it is wired in the frontend

`frontend/src/components/atlas/DetailLayer.tsx` renders one detailing glb. It
sits inside the same shared transform group as the brain layers in
`AtlasCanvas`, so the layers cannot drift apart, and it needs no per-layer
correction because the geometry arrives already in the atlas frame.

It is deliberately not `BrainLayer`. The parcellation layers join every mesh node
to a `region_id` in `regions.json` and are individually pickable; a detailing
layer is one merged mesh with no catalog entry, so reusing `BrainLayer` would
fail its contract check on every load. Two other things follow from that:

- Detailing meshes are removed from raycasting. A vessel drawn over the cortex
  must not steal a click meant for the region underneath it.
- The component only mounts while its layer is switched on. The glbs are several
  megabytes each and most sessions never turn them on, so gating the mount keeps
  them out of first paint. `useGLTF` caches by url, so switching a layer back on
  is immediate.

Colours live in `DETAIL_TISSUE` in `lib/atlas/tissue.ts`: arterial red, venous
blue, ochre nerves. None collides with the reserved medical accents (cyan
select, ember/violet involvement, amber pending).

## What must NOT happen

Do not hand-model or invent vessel positions to "look right". Either the mesh
comes from a real, licensed anatomical source and is aligned to the atlas, or the
layer stays pending. The medical-honesty rule in `docs/MEDICAL_ACCURACY.md`
applies to anatomy shown in 3D exactly as it applies to text.
