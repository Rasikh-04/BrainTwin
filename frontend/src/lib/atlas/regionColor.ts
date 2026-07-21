import * as THREE from "three";

/**
 * Distinct per-region colours for the "region colour" differentiation mode.
 *
 * This is a purely visual aid: it assigns each region_id its own stable hue so
 * neighbouring parcels are easy to tell apart. It makes NO anatomical or
 * clinical claim (that would need a cited grouping per docs/MEDICAL_ACCURACY.md)
 * and is never used for disorder involvement, which is the reserved-hue system
 * (ember primary / violet secondary) shown in step 2.
 *
 * The hue comes from a hash of the region_id rather than an ordinal index, so
 * anatomically adjacent parcels (whose ids share long prefixes) still land far
 * apart on the wheel instead of shading into one another.
 */

/** Deterministic 32-bit string hash (FNV-1a), stable across sessions. */
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in the unsigned range.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const cache = new Map<string, THREE.Color>();

/**
 * Stable, well-separated colour for a region_id. Saturation and lightness are
 * fixed so the set reads as one coherent categorical palette; only the hue
 * varies. Values are tuned to stay legible on both the light and dark stage.
 */
export function regionColor(regionId: string): THREE.Color {
  const cached = cache.get(regionId);
  if (cached) return cached;

  const hash = hashString(regionId);
  const hue = hash % 360;
  // A second hash bit nudges lightness so same-hue collisions still differ.
  const lightnessJitter = ((hash >>> 9) & 0x3f) / 0x3f; // 0..1
  const color = new THREE.Color().setHSL(
    hue / 360,
    0.58,
    0.52 + lightnessJitter * 0.12,
  );

  cache.set(regionId, color);
  return color;
}
