"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

import { BrainLayer } from "./BrainLayer";
import { useAtlasStore } from "@/store/useAtlasStore";

/**
 * The step-1 atlas explorer canvas.
 *
 * Coordinate handling: both glbs are exported in raw MNI space (x = right,
 * y = anterior, z = superior) with no baked node transform. Three.js is y-up,
 * so the whole atlas is rotated -90 degrees about X, which maps MNI superior
 * onto three's +Y and MNI anterior onto -Z.
 *
 * Both layers share ONE centering transform. Centering them independently would
 * align each layer's own bounding box to the origin and silently pull the
 * subcortical structures out of register with the cortex they sit inside.
 */

/**
 * Centre of the cortical bounding box in MNI millimetres. MNI's origin is the
 * anterior commissure, not the centroid of the brain, so the model needs an
 * explicit offset to orbit around its visual centre.
 */
const MNI_BBOX_CENTER: [number, number, number] = [-0.45, -14.85, 0.7];

/** Tissue tones. Deliberately desaturated so semantic accents stay legible. */
const CORTICAL_TISSUE = "#b6a6a3";
const SUBCORTICAL_TISSUE = "#8ea0b4";

const CAMERA_DISTANCE = 360;

export function AtlasCanvas() {
  const selectRegion = useAtlasStore((s) => s.selectRegion);

  return (
    <Canvas
      // Cap DPR: a retina laptop rendering the cortex at 3x is the easiest way
      // to lose the "no lag" requirement for no visible gain.
      dpr={[1, 1.75]}
      camera={{
        fov: 35,
        near: 1,
        far: 2000,
        // Left anterolateral three-quarter view: the most readable first look
        // at a brain, and it shows the lateral surface where DK regions live.
        position: [
          -CAMERA_DISTANCE * 0.72,
          CAMERA_DISTANCE * 0.3,
          -CAMERA_DISTANCE * 0.62,
        ],
      }}
      // Clicking empty space clears the selection.
      onPointerMissed={() => selectRegion(null)}
    >
      <color attach="background" args={["#070a0e"]} />

      {/*
        Plain lights rather than an HDR environment: an environment map is a
        network fetch for a CDN asset, and the app must run fully offline on a
        reviewer's machine.
      */}
      <hemisphereLight intensity={0.55} color="#dce6f2" groundColor="#0b0f15" />
      <directionalLight position={[-200, 260, -180]} intensity={1.5} />
      <directionalLight position={[240, 60, 220]} intensity={0.5} color="#9ec5ff" />

      <Suspense fallback={null}>
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <group
            position={[
              -MNI_BBOX_CENTER[0],
              -MNI_BBOX_CENTER[1],
              -MNI_BBOX_CENTER[2],
            ]}
          >
            <BrainLayer
              url="/assets/atlas/brain-cortical.glb"
              layer="cortical"
              tissueColor={CORTICAL_TISSUE}
            />
            <BrainLayer
              url="/assets/atlas/brain-subcortical.glb"
              layer="subcortical"
              tissueColor={SUBCORTICAL_TISSUE}
            />
          </group>
        </group>
      </Suspense>

      <OrbitControls
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minDistance={140}
        maxDistance={620}
      />
    </Canvas>
  );
}
