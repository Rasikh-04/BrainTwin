"use client";

import { Suspense, useEffect, useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";

import { useAtlasStore, type LayerKey } from "@/store/useAtlasStore";
import { createVesselMaterial, DETAIL_TISSUE } from "@/lib/atlas/tissue";

/**
 * Renders one detailing overlay (arteries, dural sinuses, cranial nerves).
 *
 * Deliberately not BrainLayer. The parcellation layers join every mesh node to
 * a `region_id` in regions.json and are individually pickable; these are a
 * single merged mesh with no catalog entry and no selection behaviour, because
 * the atlas has no region record for a vessel. Reusing BrainLayer here would
 * mean 60-odd orphan nodes failing its contract check on every load.
 *
 * Geometry arrives already aligned: backend/export_detailing.py writes these
 * glbs in the same MNI millimetre frame as the atlas meshes, so they mount
 * inside the same transform group with no per-layer correction.
 */

interface DetailLayerProps {
  layer: LayerKey;
}

/**
 * A vessel drawn over the cortex must not steal a click meant for the region
 * underneath it. The detailing layers are context, not targets, so they are
 * removed from hit-testing entirely.
 */
const NOOP_RAYCAST: THREE.Mesh["raycast"] = () => {};

function DetailMesh({ layer }: DetailLayerProps) {
  const { scene } = useGLTF(`/assets/atlas/brain-${layer}.glb`, true);
  const color = DETAIL_TISSUE[layer as keyof typeof DETAIL_TISSUE];

  const object = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return;
      node.material = createVesselMaterial(color);
      node.raycast = NOOP_RAYCAST;
      node.castShadow = false;
      node.receiveShadow = false;
    });
    return root;
  }, [scene, color]);

  useEffect(() => {
    return () => {
      object.traverse((node) => {
        if (node instanceof THREE.Mesh) {
          (node.material as THREE.Material).dispose();
        }
      });
    };
  }, [object]);

  return <primitive object={object} />;
}

/**
 * Mounts the layer only while it is switched on.
 *
 * The three detailing glbs are several megabytes each and most sessions never
 * turn them on, so gating the mount keeps them out of first paint entirely.
 * useGLTF caches by url, so switching a layer back on after the first time is
 * immediate rather than a refetch.
 */
export function DetailLayer({ layer }: DetailLayerProps) {
  const visible = useAtlasStore((s) => s.visibleLayers[layer]);
  if (!visible) return null;

  return (
    <Suspense fallback={null}>
      <DetailMesh layer={layer} />
    </Suspense>
  );
}
