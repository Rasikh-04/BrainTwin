"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { useAtlasStore, type LayerKey } from "@/store/useAtlasStore";
import { wasDragged } from "@/lib/atlas/pointerDrag";
import { regionColor } from "@/lib/atlas/regionColor";

/**
 * Renders one atlas glb (cortical or subcortical).
 *
 * Contract: every node name in the glb equals a `region_id` in regions.json.
 * The join is what makes picking work — we raycast to a node and look its name
 * up in the catalog, with no geometry-to-region mapping table of our own.
 *
 * Performance rules from docs/ARCHITECTURE.md are load-bearing here:
 *   - Highlighting swaps material *properties* on the picked node. Geometry is
 *     never rebuilt and vertex colours are never touched on the CPU.
 *   - Hover and selection are applied through an imperative store subscription,
 *     not React state, so moving the pointer across the cortex does not
 *     re-render the scene graph 60 times a second.
 */

interface BrainLayerProps {
  url: string;
  layer: LayerKey;
  /** Base tissue colour for this layer. */
  tissueColor: string;
}

const SELECT_COLOR = new THREE.Color("#38d6ef");
const HOVER_COLOR = new THREE.Color("#0e7490");
const BLACK = new THREE.Color("#000000");

const GHOST_OPACITY = 0.16;
/** Regions peeled away by dissection fade rather than vanish, so the cut reads. */
const DISSECT_OPACITY = 0;

/**
 * Raycast pass-through. A ghosted or peeled-away region must not intercept a
 * click meant for the structure revealed behind it — "see through" has to mean
 * "pick through" too. Swapping a mesh's raycast to a no-op removes it from
 * hit-testing without touching its visibility or geometry.
 */
const DEFAULT_RAYCAST = THREE.Mesh.prototype.raycast;
const NOOP_RAYCAST: THREE.Mesh["raycast"] = () => {};

export function BrainLayer({ url, layer, tissueColor }: BrainLayerProps) {
  // `true` enables the Draco decoder. It is only fetched if a glb is actually
  // Draco-compressed, so this is safe now and ready for the compressed meshes.
  const { scene } = useGLTF(url, true);

  const regionsById = useAtlasStore((s) => s.regionsById);
  const visible = useAtlasStore((s) => s.visibleLayers[layer]);
  const ghostCortex = useAtlasStore((s) => s.ghostCortex);

  const selectRegion = useAtlasStore((s) => s.selectRegion);
  const hoverRegion = useAtlasStore((s) => s.hoverRegion);

  /**
   * Give every region node its own material instance exactly once, so
   * highlighting one region cannot bleed into its neighbours (glb exporters
   * commonly share a single material across all nodes).
   */
  const baseColor = useMemo(() => new THREE.Color(tissueColor), [tissueColor]);

  const meshes = useMemo(() => {
    const byRegionId = new Map<string, THREE.Mesh>();

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      // Physical material with a faint clearcoat reads as living tissue under
      // the studio lights: matte gyral surface with a soft wet sheen in the
      // sulci, instead of the flat clay of a plain standard material. Sheen
      // adds the slight backscatter that makes a brain look soft, not carved.
      //
      // DoubleSide is what stops the brain reading as a hollow shell: the atlas
      // meshes are open surfaces, so with front-face-only culling you see
      // straight through to nothing at the brainstem opening and whenever a
      // region is isolated. Rendering the back faces gives every cut an inner
      // wall, so the tissue looks solid.
      const material = new THREE.MeshPhysicalMaterial({
        color: baseColor.clone(),
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
      object.material = material;
      object.castShadow = false;
      object.receiveShadow = false;
      byRegionId.set(object.name, object);
    });

    return byRegionId;
  }, [scene, baseColor]);

  /**
   * Contract check at the boundary: an unjoinable node means the mesh and the
   * catalog have drifted. Surface it loudly instead of silently rendering an
   * unclickable region.
   */
  useEffect(() => {
    if (regionsById.size === 0) return;
    const orphans = [...meshes.keys()].filter((name) => !regionsById.has(name));
    if (orphans.length > 0) {
      console.error(
        `[contract] ${url}: ${orphans.length} mesh node(s) have no regions.json entry:`,
        orphans.slice(0, 10),
      );
    }
  }, [meshes, regionsById, url]);

  /**
   * Imperative highlight + dissection application — no React render involved.
   * Reads the whole store state so selection, hover, isolation, and per-region
   * hiding all resolve in one pass over this layer's meshes.
   */
  type ApplyState = (state: {
    selectedRegionId: string | null;
    hoveredRegionId: string | null;
    isolatedRegionId: string | null;
    hiddenRegionIds: Set<string>;
    regionColorMode: boolean;
  }) => void;
  const applyState = useRef<ApplyState>(() => {});

  useEffect(() => {
    applyState.current = ({
      selectedRegionId,
      hoveredRegionId,
      isolatedRegionId,
      hiddenRegionIds,
      regionColorMode,
    }) => {
      for (const [regionId, mesh] of meshes) {
        const material = mesh.material as THREE.MeshPhysicalMaterial;

        // Base tint: the region's own distinct hue in colour mode, otherwise
        // the layer's shared tissue tone. Restored every pass so toggling the
        // mode off returns the tissue colour without a geometry rebuild.
        material.color.copy(
          regionColorMode ? regionColor(regionId) : baseColor,
        );

        // Dissection resolves first: an isolated region hides every other
        // region across every layer; a hidden region is removed outright.
        const isolatedElsewhere =
          isolatedRegionId !== null && regionId !== isolatedRegionId;
        const removed = hiddenRegionIds.has(regionId) || isolatedElsewhere;
        mesh.visible = !removed;
        if (removed) {
          material.opacity = DISSECT_OPACITY;
          // A removed region is gone from the scene; make sure it is also gone
          // from hit-testing so it can never intercept a click for a revealed
          // structure behind it.
          mesh.raycast = NOOP_RAYCAST;
          continue;
        }
        const isSelected = regionId === selectedRegionId;
        const isHovered = regionId === hoveredRegionId;

        if (isSelected) {
          material.emissive.copy(SELECT_COLOR);
          material.emissiveIntensity = 0.55;
        } else if (isHovered) {
          material.emissive.copy(HOVER_COLOR);
          material.emissiveIntensity = 0.35;
        } else {
          material.emissive.copy(BLACK);
          material.emissiveIntensity = 0;
        }

        // A ghosted cortex must not occlude the structures behind it in the
        // depth buffer. Toggling `transparent` swaps the material's blending
        // mode, which three.js only picks up on a shader recompile — hence
        // needsUpdate. Guarded so we do not force a recompile on every hover.
        const ghosted = ghostCortex && layer === "cortical" && !isSelected;
        if (material.transparent !== ghosted) {
          material.transparent = ghosted;
          material.needsUpdate = true;
        }
        material.opacity = ghosted ? GHOST_OPACITY : 1;
        material.depthWrite = !ghosted;

        // Pick-through: a ghosted (see-through) cortex must let clicks reach the
        // subcortical structures behind it. Any other visible region stays
        // pickable.
        mesh.raycast = ghosted ? NOOP_RAYCAST : DEFAULT_RAYCAST;
      }
    };

    applyState.current(useAtlasStore.getState());

    return useAtlasStore.subscribe((state) => applyState.current(state));
  }, [meshes, ghostCortex, layer, baseColor]);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    if (!visible) return;
    event.stopPropagation();
    const name = event.object.name;
    if (regionsById.has(name)) {
      hoverRegion(name);
      document.body.style.cursor = "pointer";
    }
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    hoverRegion(null);
    document.body.style.cursor = "";
  };

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    if (!visible) return;
    event.stopPropagation();
    if (wasDragged(event.nativeEvent.clientX, event.nativeEvent.clientY)) return;
    const name = event.object.name;
    if (regionsById.has(name)) selectRegion(name);
  };

  useEffect(() => () => void (document.body.style.cursor = ""), []);

  return (
    <primitive
      object={scene}
      visible={visible}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  );
}

useGLTF.preload("/assets/atlas/brain-cortical.glb");
useGLTF.preload("/assets/atlas/brain-subcortical.glb");
