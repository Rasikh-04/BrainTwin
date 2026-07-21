"use client";

import dynamic from "next/dynamic";

import type { AtrophyPairEvidence } from "@/lib/contract/types";

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
 * Neurodegenerative atrophy evidence (Alzheimer's): a baseline scan beside a
 * follow-up scan, so a reviewer can see volume loss over time. Serves every
 * `atrophy-pair` disorder. Each scan is its own Niivue surface; only this view
 * is mounted at a time, so the two-context rule still holds against the atlas.
 */
export function AtrophyPair({ evidence }: { evidence: AtrophyPairEvidence }) {
  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-px bg-line md:grid-cols-2">
      <figure className="flex min-h-0 flex-col bg-[#08090c]">
        <figcaption className="ident shrink-0 bg-surface-1 px-3 py-1.5 text-ink-muted">
          Baseline
        </figcaption>
        <div className="min-h-0 flex-1">
          <NiivueMount
            label="Baseline structural scan"
            volumes={[{ url: evidence.baseline, colormap: "gray" }]}
          />
        </div>
      </figure>

      <figure className="flex min-h-0 flex-col bg-[#08090c]">
        <figcaption className="ident shrink-0 bg-surface-1 px-3 py-1.5 text-ink-muted">
          Follow-up
        </figcaption>
        <div className="min-h-0 flex-1">
          <NiivueMount
            label="Follow-up structural scan"
            volumes={[{ url: evidence.followup, colormap: "gray" }]}
          />
        </div>
      </figure>
    </div>
  );
}
