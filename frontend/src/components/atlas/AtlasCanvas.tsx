"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import type { WebGLRenderer } from "three";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";

import { BrainLayer } from "./BrainLayer";
import {
  useAtlasStore,
  type ViewPreset,
} from "@/store/useAtlasStore";
import { recordPointerDown, wasDragged } from "@/lib/atlas/pointerDrag";

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

/** Tissue tones. A richer anatomical rose cortex over cooler grey-blue deep
 *  structures, so the surface reads as living tissue rather than pale clay. */
const CORTICAL_TISSUE = "#d9948c";
const SUBCORTICAL_TISSUE = "#93a1ba";

const WHOLE_BRAIN_DISTANCE = 415;
const FOCUS_DISTANCE = 185;

/**
 * Camera direction (centre -> camera) for each standard view, in world space.
 * World axes after the atlas transform: +X = right, +Y = superior,
 * -Z = anterior. A small offset is added to pure axes so the near-orthographic
 * views keep a hint of depth and never gimbal-lock the up vector.
 */
const VIEW_DIRECTIONS: Record<ViewPreset, THREE.Vector3> = {
  // Left lateral profile — the classic sagittal look at the cortex.
  sagittal: new THREE.Vector3(-1, 0.06, 0.04).normalize(),
  // From the front (anterior).
  coronal: new THREE.Vector3(0.04, 0.06, -1).normalize(),
  // From above (superior), looking down.
  axial: new THREE.Vector3(0.02, 1, 0.03).normalize(),
  // The readable three-quarter default.
  anterolateral: new THREE.Vector3(-0.72, 0.3, -0.62).normalize(),
};

/** MNI centroid -> world position, matching the group transform below. */
function worldFromMni(p: [number, number, number]): THREE.Vector3 {
  const [cx, cy, cz] = MNI_BBOX_CENTER;
  return new THREE.Vector3(p[0] - cx, p[2] - cz, -(p[1] - cy));
}

/** A region close enough to the midline that it has no reliable outward face. */
const CENTRAL_REGION_RADIUS = 20;

/**
 * Direction (brain centre -> camera) that looks straight at a region from
 * outside the brain, along the line from the centre through the region
 * itself. A fixed preset direction (e.g. sagittal, always from the left)
 * has no relation to where the selected region actually sits, so focusing
 * on a right-hemisphere region while "sagittal" is active would have to
 * look through the entire left hemisphere to reach it — blocked instead of
 * framed. Aiming outward from the region's own position guarantees a clear,
 * front-on view of whatever was picked, regardless of the active preset.
 */
function outwardDirection(
  target: THREE.Vector3,
  fallback: THREE.Vector3,
): THREE.Vector3 {
  if (target.length() < CENTRAL_REGION_RADIUS) return fallback.clone();

  const dir = target.clone();
  // Nudge the elevation up a little so a region that sits near the vertical
  // axis doesn't level the camera into a pure top-down look, which flips
  // the up vector and spins the view.
  dir.y += Math.max(dir.length() * 0.06, 4);
  return dir.normalize();
}

const TWEEN_MS = 620;

/**
 * Drives the camera to the requested standard view, and (when focus is on)
 * frames the selected region so the picked structure comes to the front —
 * the "sagittal that brings the selection forward" behaviour, made explicit
 * and toggleable against a plain whole-brain centre.
 */
function ViewRig({
  controls,
}: {
  controls: React.RefObject<OrbitControlsImpl | null>;
}) {
  const camera = useThree((s) => s.camera);

  const viewNonce = useAtlasStore((s) => s.viewNonce);
  const viewPreset = useAtlasStore((s) => s.viewPreset);
  const focusSelected = useAtlasStore((s) => s.focusSelected);
  const selectedRegionId = useAtlasStore((s) => s.selectedRegionId);

  const tween = useRef({
    active: false,
    start: 0,
    fromPos: new THREE.Vector3(),
    toPos: new THREE.Vector3(),
    fromTarget: new THREE.Vector3(),
    toTarget: new THREE.Vector3(),
  });

  useEffect(() => {
    const { regionsById } = useAtlasStore.getState();
    const region = selectedRegionId
      ? regionsById.get(selectedRegionId)
      : undefined;

    const focusing = focusSelected && !!region;
    const target =
      focusing && region
        ? worldFromMni(region.centroid_mni)
        : new THREE.Vector3(0, 0, 0);
    const distance = focusing ? FOCUS_DISTANCE : WHOLE_BRAIN_DISTANCE;

    const direction = focusing
      ? outwardDirection(target, VIEW_DIRECTIONS[viewPreset])
      : VIEW_DIRECTIONS[viewPreset];

    const toPos = direction.clone().multiplyScalar(distance).add(target);

    const t = tween.current;
    t.fromPos.copy(camera.position);
    t.toPos.copy(toPos);
    t.fromTarget.copy(controls.current?.target ?? new THREE.Vector3());
    t.toTarget.copy(target);
    t.start = performance.now();
    t.active = true;
    // viewNonce is intentionally a dependency: re-selecting the same preset
    // still re-frames (e.g. after the user has orbited away).
  }, [viewNonce, viewPreset, focusSelected, selectedRegionId, camera, controls]);

  useFrame(() => {
    const t = tween.current;
    if (!t.active || !controls.current) return;

    const elapsed = performance.now() - t.start;
    const raw = Math.min(elapsed / TWEEN_MS, 1);
    // easeInOutCubic
    const e =
      raw < 0.5 ? 4 * raw * raw * raw : 1 - Math.pow(-2 * raw + 2, 3) / 2;

    camera.position.lerpVectors(t.fromPos, t.toPos, e);
    controls.current.target.lerpVectors(t.fromTarget, t.toTarget, e);
    controls.current.update();

    if (raw >= 1) t.active = false;
  });

  return null;
}

/**
 * The three-point rig is tuned per theme. On the light stage the brain would
 * read as a dark object on white without more fill, so ambient and hemisphere
 * lift and the ground bounce goes light; on the dark stage the rig stays
 * contrasty so the silhouette reads off the deep background.
 */
const LIGHTING = {
  light: {
    hemi: { intensity: 0.85, color: "#eef4fc", ground: "#c9d2df" },
    ambient: 0.34,
    key: 2.0,
    fill: 0.85,
    back: 0.95,
  },
  dark: {
    hemi: { intensity: 0.5, color: "#cdd8e8", ground: "#12161d" },
    ambient: 0.14,
    key: 2.1,
    fill: 0.7,
    back: 1.25,
  },
} as const;

export function AtlasCanvas() {
  const selectRegion = useAtlasStore((s) => s.selectRegion);
  const theme = useAtlasStore((s) => s.theme);
  const light = LIGHTING[theme];
  const controls = useRef<OrbitControlsImpl | null>(null);
  const glRef = useRef<WebGLRenderer | null>(null);

  // Free this WebGL context the instant the atlas unmounts (entering the
  // evidence view). The app runs two WebGL contexts one at a time; if the atlas
  // context is still held by the GPU process when Niivue creates its context in
  // the evidence view, the new context can come up already lost on stricter
  // drivers (Intel/Mesa on Linux), which shows as "shader failed to link". R3F
  // disposes on unmount, but forcing the loss here releases the slot eagerly and
  // deterministically, before Niivue asks for its own.
  useEffect(() => {
    return () => {
      const gl = glRef.current;
      if (!gl) return;
      try {
        gl.forceContextLoss();
      } catch {
        // Context may already be gone; nothing to release.
      }
      try {
        gl.dispose();
      } catch {
        // Renderer may already be disposed by R3F; ignore.
      }
    };
  }, []);

  return (
    <Canvas
      onCreated={({ gl }) => {
        glRef.current = gl;
      }}
      // Cap DPR: a retina laptop rendering the cortex at 3x is the easiest way
      // to lose the "no lag" requirement for no visible gain.
      dpr={[1, 1.75]}
      // Transparent: the brain renders over the CSS radial stage behind the
      // canvas, so it sits in a soft pool of light rather than on flat black.
      gl={{ alpha: true, antialias: true }}
      camera={{
        fov: 35,
        near: 1,
        far: 2000,
        position: [
          -WHOLE_BRAIN_DISTANCE * 0.72,
          WHOLE_BRAIN_DISTANCE * 0.3,
          -WHOLE_BRAIN_DISTANCE * 0.62,
        ],
      }}
      // Clicking empty space clears the selection — but not when the
      // pointer only landed there because an orbit drag ended over it.
      onPointerDown={(event) => recordPointerDown(event.clientX, event.clientY)}
      onPointerMissed={(event) => {
        if (wasDragged(event.clientX, event.clientY)) return;
        selectRegion(null);
      }}
    >
      {/*
        Studio three-point rig rather than an HDR environment: an environment
        map is a network fetch for a CDN asset, and the app must run fully
        offline on a reviewer's machine. A warm key, a cool fill, and a cool
        back-rim give the tissue form and a clean silhouette off the dark stage.
      */}
      <hemisphereLight
        intensity={light.hemi.intensity}
        color={light.hemi.color}
        groundColor={light.hemi.ground}
      />
      <ambientLight intensity={light.ambient} />
      <directionalLight
        position={[-190, 240, -150]}
        intensity={light.key}
        color="#fff3ea"
      />
      <directionalLight
        position={[230, 50, 180]}
        intensity={light.fill}
        color="#9ec5ff"
      />
      <directionalLight
        position={[60, 130, -260]}
        intensity={light.back}
        color="#cfe0ff"
      />

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

      <ViewRig controls={controls} />

      <OrbitControls
        ref={controls}
        makeDefault
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.7}
        minDistance={120}
        maxDistance={620}
      />
    </Canvas>
  );
}
