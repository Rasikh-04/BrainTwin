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

interface AtrophyPairProps {
  evidence: AtrophyPairEvidence;
  /**
   * Honest framing of what the two panels are, taken verbatim from the case
   * data (the mappings' shared provenance) — never authored here. For the wired
   * OASIS case this states that the pair is a cross-subject comparison of GM
   * maps, not one patient over time, so the captions cannot imply otherwise.
   */
  note?: string;
}

/**
 * Neurodegenerative atrophy evidence (Alzheimer's): a reference scan beside the
 * affected case, so a reviewer can compare regional volume. Serves every
 * `atrophy-pair` disorder. Each scan is its own Niivue surface; only this view
 * is mounted at a time, so the two-context rule still holds against the atlas.
 *
 * The panels are labelled "Reference" / "Case", not "Baseline" / "Follow-up":
 * the wired OASIS pair is two different de-identified subjects (a control vs an
 * Alzheimer's case), not one patient scanned over time, and the caption must not
 * imply a longitudinal read the data does not support.
 */
export function AtrophyPair({ evidence, note }: AtrophyPairProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px bg-line md:grid-cols-2">
        <figure className="flex min-h-0 flex-col bg-[#08090c]">
          <figcaption className="ident shrink-0 bg-surface-1 px-3 py-1.5 text-ink-muted">
            Reference
          </figcaption>
          <div className="min-h-0 flex-1">
            <NiivueMount
              label="Reference subject scan"
              volumes={[{ url: evidence.baseline, colormap: "gray" }]}
            />
          </div>
        </figure>

        <figure className="flex min-h-0 flex-col bg-[#08090c]">
          <figcaption className="ident shrink-0 bg-surface-1 px-3 py-1.5 text-ink-muted">
            Case
          </figcaption>
          <div className="min-h-0 flex-1">
            <NiivueMount
              label="Affected case scan"
              volumes={[{ url: evidence.followup, colormap: "gray" }]}
            />
          </div>
        </figure>
      </div>

      {note && (
        <p className="t-fine shrink-0 border-t border-line bg-surface-1 px-3 py-2 leading-relaxed text-ink-faint">
          {note}
        </p>
      )}
    </div>
  );
}
