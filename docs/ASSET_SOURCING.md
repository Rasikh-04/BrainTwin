# Asset sourcing: vessels and nerves (detailing layers)

This documents where the veins, arteries, and cranial-nerve meshes come from,
and how to turn them into the glbs the frontend detailing layers expect. The
frontend already has the layers wired (`veins`, `arteries`, `nerves` in the
layer controls); they render as disabled "soon" toggles until a mesh is present.

Why this is a separate step, not something baked in the last session: the brain
in your `Brain_reference_anatomy.jpeg` reference is from **Visible Body / Human
Anatomy Atlas**, which is proprietary. Those exact meshes cannot be reused. Free,
openly-licensed vessel and nerve meshes exist, but none of them ship registered
to the MNI atlas space our brain meshes use, so each source needs a manual
alignment pass. That alignment is the real work here.

## Recommended source: Z-Anatomy (one coherent atlas, all three layers)

- Project: https://www.z-anatomy.com/
- Code / meshes: https://github.com/LluisV/Z-Anatomy (Blender files, per-region
  named objects for arteries, veins, and cranial nerves)
- License: CC-BY-SA 4.0 (attribution + share-alike). Safe to redistribute the
  derived glbs **if** we keep the attribution and license. This matters because
  our atlas glbs are already CC-licensed and committed; the vessel glbs would be
  too, so unlike the patient case assets they do **not** need to be git-ignored.

Z-Anatomy is derived from BodyParts3D and gives one consistent coordinate frame
across all three layers, which is why it is the first choice: align it once and
all three detailing layers line up together.

### Turning it into our glbs

1. Run `backend/download_detailing_assets.sh` (resumable) to pull the source.
2. Open the `.blend` in Blender. Select only the cerebral structures you want
   per layer (e.g. cerebral arteries incl. the circle of Willis; superficial and
   deep cerebral veins / dural sinuses; the cranial nerves visible in the
   reference). Delete the rest of the body.
3. Name each object so its object name is stable — the frontend does not need
   these to be `region_id`s (they are not atlas regions), but stable names help
   future per-structure picking.
4. Export three glbs: `veins.glb`, `arteries.glb`, `nerves.glb`.
5. Decimate to keep each under a few hundred thousand verts total (the atlas
   perf budget in `docs/PROGRESS.md` still applies; Draco is the next lever).
6. Drop them in `frontend/public/assets/atlas/`.

### The alignment caveat (the part that needs care)

Z-Anatomy is not in MNI space. Before the vessels sit correctly inside our
brain, they need a scale + rotation + translation into the atlas frame. Do this
as a single transform on each glb (or one shared parent transform), the same way
`AtlasCanvas` already shares one transform across cortical and subcortical so the
layers cannot drift apart. Eyeball it against the cortex, then verify a known
landmark (e.g. the middle cerebral artery running in the lateral sulcus).

## Alternative sources

- **BodyParts3D / Anatomography** (DBCLS): https://lifesciencedb.jp/bp3d/ —
  per-structure OBJ by FMA ID, CC-BY-SA 2.1 Japan. Z-Anatomy is built from this;
  use it directly only if you want a specific structure Z-Anatomy lacks.
- **NIH 3D**: https://3d.nih.gov/ — search "circle of Willis", "cerebral
  vasculature", "cranial nerves". Many models are CC0 / public domain. Quality
  and coordinate frame vary per upload, so this is best for a single hero vessel
  (e.g. the arteries) rather than a matched set.

## Wiring a mesh into the frontend once it exists

1. Add a `BrainLayer`-style loader for the detailing glb in `AtlasCanvas`, under
   the same shared transform group as the brain layers (see the alignment
   caveat). A detailing layer is simpler than `BrainLayer`: no `region_id` join,
   just a colored mesh that the layer toggle shows/hides.
2. In `LayerControls`, drop the `pending` prop from that layer's toggle so it
   becomes live.
3. Give each detailing layer a distinct, non-semantic color that does not
   collide with the reserved medical accents (cyan select, ember/violet
   involvement, amber pending). Vessels read naturally as desaturated red
   (arteries) and blue (veins); nerves as pale yellow — matching the reference.

## What must NOT happen

Do not hand-model or invent vessel positions to "look right". Either the mesh
comes from a real, licensed anatomical source and is aligned to the atlas, or the
layer stays pending. The medical-honesty rule in `docs/MEDICAL_ACCURACY.md`
applies to anatomy shown in 3D exactly as it applies to text.
