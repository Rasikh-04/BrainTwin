"use client";

import dynamic from "next/dynamic";

import type { LesionOverlayEvidence } from "@/lib/contract/types";

// Niivue is heavy and WebGL-only: code-split it and keep it out of SSR so it
// never enters the atlas chunk or the server bundle.
const NiivueMount = dynamic(
  () => import("../NiivueMount").then((m) => m.NiivueMount),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-[#08090c]">
        <p className="ident text-white/60">Preparing viewer…</p>
      </div>
    ),
  },
);

/**
 * Structural lesion evidence (tumour, stroke): a grayscale base volume with the
 * segmentation mask overlaid. Serves every `lesion-overlay` disorder — the code
 * branches on the renderer, never on the disorder (frontend/CLAUDE.md).
 *
 * The overlay shows the mask as delivered; the legend states what each voxel
 * value means from the contract's `mask_labels`. We do not colour-code the
 * sub-labels, because we would then be asserting a value→colour mapping we do
 * not control — the textual legend is the honest surface.
 */
export function LesionOverlay({ evidence }: { evidence: LesionOverlayEvidence }) {
  const labels = Object.entries(evidence.mask_labels).sort(
    ([a], [b]) => Number(a) - Number(b),
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1">
        <NiivueMount
          label="Lesion segmentation overlaid on the structural scan"
          volumes={[
            { url: evidence.base, colormap: "gray" },
            { url: evidence.mask, colormap: "red", opacity: 0.55 },
          ]}
        />
      </div>

      {labels.length > 0 && (
        <div className="shrink-0 border-t border-line bg-surface-1 px-4 py-2.5">
          <p className="ident mb-1.5">Mask labels</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {labels.map(([value, name]) => (
              <li
                key={value}
                className="flex items-baseline gap-1.5 text-[11.5px] text-ink-muted"
              >
                <span className="ident tabular-nums text-ink-faint">
                  {value}
                </span>
                <span>{name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
