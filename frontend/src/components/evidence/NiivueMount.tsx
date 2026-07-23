"use client";

import { Niivue, SLICE_TYPE } from "@niivue/niivue";
import { useEffect, useRef, useState } from "react";

/** One overlay layer to hand to Niivue. `url` is a static asset path. */
export interface NiivueVolume {
  url: string;
  colormap?: string;
  opacity?: number;
}

interface NiivueMountProps {
  /** Base first, overlays after. Drawn in array order. */
  volumes: NiivueVolume[];
  /** Accessible description of what the scene shows. */
  label: string;
}

/**
 * The single Niivue-owned WebGL surface for the evidence view.
 *
 * This is the only place a second WebGL context exists in the app, and it exists
 * only while an evidence view is mounted — the atlas R3F canvas is unmounted
 * before we get here (frontend/CLAUDE.md, "two WebGL contexts, one at a time").
 * The instance is created on mount, torn down on unmount, and the GL context is
 * explicitly released so returning to the atlas never leaves two contexts live.
 *
 * Imported through next/dynamic with `ssr:false` by the renderers, so Niivue
 * never enters the server bundle or the atlas chunk.
 */
/** Thrown when Niivue is handed a WebGL context that is already lost, so the
 *  mount can retry on a fresh canvas instead of surfacing a false load error. */
class ContextLostError extends Error {
  constructor() {
    super("WebGL context lost");
    this.name = "ContextLostError";
  }
}

/** How many times to remount the canvas for a fresh GL context before giving up. */
const MAX_CONTEXT_ATTEMPTS = 3;

function contextIsLost(nv: Niivue): boolean {
  const gl = (nv as unknown as { gl?: WebGL2RenderingContext | null }).gl;
  return !gl || gl.isContextLost();
}

export function NiivueMount({ volumes, label }: NiivueMountProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = useState<string | null>(null);
  // Bumped to remount the <canvas> element and obtain a brand-new GL context.
  // A canvas caches its context, so if the first one comes up lost we cannot
  // recover on the same element — only a fresh canvas yields a fresh context.
  const [attempt, setAttempt] = useState(0);

  // Serialise the volume list so the effect re-runs only when the actual layers
  // change, not on every parent render (the array identity is new each render).
  const volumesKey = JSON.stringify(volumes);

  // A new case (new layers) starts the context-attempt count over. Done during
  // render via React's "adjust state when a prop changes" pattern rather than in
  // an effect, so it applies before paint and without a cascading re-render.
  const [prevVolumesKey, setPrevVolumesKey] = useState(volumesKey);
  if (prevVolumesKey !== volumesKey) {
    setPrevVolumesKey(volumesKey);
    setAttempt(0);
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;
    // Dark, near-black stage in both themes: medical volumes are viewed against
    // black so intensity windowing reads correctly, regardless of app chrome.
    const nv = new Niivue({
      backColor: [0.03, 0.04, 0.06, 1],
      show3Dcrosshair: true,
      crosshairColor: [0.2, 0.85, 0.95, 1],
      isColorbar: false,
      loadingText: "Loading volume…",
    });

    async function run() {
      try {
        setStatus("loading");
        await nv.attachToCanvas(canvas as HTMLCanvasElement);
        if (disposed) return;
        // The atlas->evidence WebGL handoff can hand Niivue a context that is
        // already lost on stricter drivers (Intel/Mesa). That surfaces as a
        // bogus "shader failed to link", not a data problem. Detect it and get a
        // clean context by remounting the canvas rather than showing an error.
        if (contextIsLost(nv)) {
          throw new ContextLostError();
        }
        await nv.loadVolumes(volumes.map((v) => ({ ...v })));
        if (disposed) return;
        if (contextIsLost(nv)) {
          throw new ContextLostError();
        }
        nv.setSliceType(SLICE_TYPE.MULTIPLANAR);
        setStatus("ready");
      } catch (error: unknown) {
        if (disposed) return;
        const lost = error instanceof ContextLostError || contextIsLost(nv);
        if (lost && attempt < MAX_CONTEXT_ATTEMPTS - 1) {
          // Retry into a fresh canvas after letting the GPU settle a beat.
          setStatus("loading");
          window.setTimeout(() => {
            if (!disposed) setAttempt((a) => a + 1);
          }, 160 * (attempt + 1));
          return;
        }
        // Surfaced, never swallowed: a genuinely failed load must not look like
        // an empty-but-fine scan. Likely a missing asset or a not-a-NIfTI file.
        console.error("[evidence] Niivue failed to load volumes", error);
        setMessage(
          lost
            ? "The graphics context was lost. Try reopening this study, or your browser may be low on GPU resources."
            : error instanceof Error
              ? error.message
              : "Could not load the scan.",
        );
        setStatus("error");
      }
    }

    // Defer past the current commit so the atlas WebGL context (freed on its
    // unmount) is fully released before we create ours; the two contexts then
    // never contend for a GPU slot during the switch.
    const raf = requestAnimationFrame(() => {
      if (!disposed) void run();
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      // Niivue has no destroy() in this version; drop the GL context ourselves so
      // we never return to the atlas with two live contexts.
      try {
        const gl = (nv as unknown as { gl?: WebGL2RenderingContext | null }).gl;
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
      } catch {
        // The context may already be gone; nothing to release.
      }
    };
    // volumesKey stands in for the volumes array identity, which is new on every
    // render; `attempt` re-runs the effect against a freshly mounted canvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [volumesKey, attempt]);

  return (
    <div className="relative h-full w-full bg-[#08090c]">
      <canvas
        // Remounting on `attempt` discards the lost-context canvas for a fresh one.
        key={attempt}
        ref={canvasRef}
        aria-label={label}
        className="block h-full w-full"
      />

      {status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="ident text-white/70">Loading scan…</p>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-1.5">
            <p className="text-[13px] font-medium text-white/90">
              Scan could not be loaded
            </p>
            <p className="text-[12px] leading-relaxed text-white/60">
              {message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
