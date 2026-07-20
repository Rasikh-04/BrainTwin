"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { useAtlasStore, type LayerKey } from "@/store/useAtlasStore";

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

const SELECT_COLOR = new THREE.Color("#22d3ee");
const HOVER_COLOR = new THREE.Color("#0e7490");
const BLACK = new THREE.Color("#000000");

const GHOST_OPACITY = 0.18;

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
  const meshes = useMemo(() => {
    const byRegionId = new Map<string, THREE.Mesh>();
    const base = new THREE.Color(tissueColor);

    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;

      object.material = new THREE.MeshStandardMaterial({
        color: base.clone(),
        roughness: 0.82,
        metalness: 0.02,
        // Cortical folds read as mush without a little front-to-back falloff.
        flatShading: false,
      });
      object.castShadow = false;
      object.receiveShadow = false;
      byRegionId.set(object.name, object);
    });

    return byRegionId;
  }, [scene, tissueColor]);

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

  /** Imperative highlight application — no React render involved. */
  type ApplyHighlight = (
    selectedId: string | null,
    hoveredId: string | null,
  ) => void;
  const applyHighlight = useRef<ApplyHighlight>(() => {});

  useEffect(() => {
    applyHighlight.current = (selectedId, hoveredId) => {
      for (const [regionId, mesh] of meshes) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const isSelected = regionId === selectedId;
        const isHovered = regionId === hoveredId;

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
      }
    };

    const { selectedRegionId, hoveredRegionId } = useAtlasStore.getState();
    applyHighlight.current(selectedRegionId, hoveredRegionId);

    return useAtlasStore.subscribe((state) =>
      applyHighlight.current(state.selectedRegionId, state.hoveredRegionId),
    );
  }, [meshes, ghostCortex, layer]);

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
