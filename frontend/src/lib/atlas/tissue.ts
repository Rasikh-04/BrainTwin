import * as THREE from "three";

/**
 * Tissue appearance for the atlas explorer.
 *
 * Do not try the "solid cortex" trick again without new geometry. It was built
 * and reverted, and the reasons are in the mesh, not in the shading:
 *
 *   - Every one of the 68 cortical nodes is an *open* surface patch. The DK
 *     parcels tile the pial surface; they do not enclose a volume. So there is
 *     no interior to shade, only a second side of the same sheet.
 *   - Neighbouring parcels do not even share their boundary vertices — there is
 *     a real hairline gap between every pair of regions. Anything drawn behind
 *     the surface shows through those gaps as grout tracing each border.
 *   - Re-drawing the geometry offset inward along its normals (the usual way to
 *     fake thickness) self-intersects on a folded cortex: past about 3 mm the
 *     offset copy erupts through the gyral crowns as pale shards.
 *
 * Real thickness needs a closed mesh — a white-matter surface exported
 * alongside the pial one, so the cortex has an actual inner boundary instead of
 * a shading trick standing in for it. That is a backend/asset change.
 */

/** Tissue tones. A richer anatomical rose cortex over cooler deep structures,
 *  so the surface reads as living tissue rather than pale clay. */
export const TISSUE = {
  /** Outer cortical (pial) surface. */
  cortex: "#d9948c",
  /**
   * Deep grey structures. Kept in the same warm-neutral family as the cortex —
   * a cold blue-grey here made the subcortical layer look like a separate
   * plastic object sitting inside the brain rather than continuous tissue.
   */
  subcortical: "#a49dab",
} as const;

/**
 * Detailing-layer tones.
 *
 * Conventional anatomical-illustration colours, chosen so the three overlays
 * stay separable when more than one is on at once, and so none of them can be
 * confused with the selection cyan or the pending amber used for state.
 */
export const DETAIL_TISSUE = {
  /** Oxygenated arterial blood. */
  arteries: "#c0392b",
  /** Dural venous sinuses. Deoxygenated, so the darker blue. */
  veins: "#3b6ea5",
  /**
   * Cranial nerves. Illustration convention is a pale ivory, but the nerves
   * are thin and sit against a light stage, so this is pulled down towards
   * ochre for enough contrast to actually read at atlas scale.
   */
  nerves: "#c9a961",
} as const;

/**
 * Material for a detailing layer (vessels, nerves).
 *
 * Glossier and less scattering than the tissue material: these are wet tubular
 * structures sitting on top of a matte brain, and the contrast in finish is
 * what separates them from the cortex at a glance.
 *
 * DoubleSide because the export clips each structure at the cranial cavity, so
 * every vessel that leaves the skull ends in an open cut face.
 */
export function createVesselMaterial(color: string): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(color),
    roughness: 0.34,
    metalness: 0,
    clearcoat: 0.6,
    clearcoatRoughness: 0.22,
    side: THREE.DoubleSide,
  });
}

/**
 * Surface material for a region node.
 *
 * A physical material with a faint clearcoat reads as living tissue under the
 * studio lights: matte gyral surface with a soft wet sheen in the sulci,
 * instead of the flat clay of a plain standard material. Sheen adds the slight
 * backscatter that makes a brain look soft rather than carved.
 *
 * DoubleSide because the parcels are open sheets: with front-face culling you
 * see straight past them wherever an edge faces you. It does not make the brain
 * solid (see the note above), but it does stop the model from disappearing at
 * the medial wall and around any dissected region.
 */
export function createSurfaceMaterial(
  color: THREE.Color,
): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: color.clone(),
    roughness: 0.6,
    metalness: 0,
    clearcoat: 0.24,
    clearcoatRoughness: 0.48,
    sheen: 0.55,
    sheenRoughness: 0.85,
    sheenColor: new THREE.Color("#ffcabf"),
    side: THREE.DoubleSide,
    flatShading: false,
  });
}
