"use client";

import type { Disorder, EvidenceRenderer } from "@/lib/contract/types";

const RENDERER_LABEL: Record<EvidenceRenderer, string> = {
  "lesion-overlay": "lesion overlay",
  "atrophy-pair": "atrophy pair",
  eeg: "EEG",
};

interface DisorderListProps {
  disorders: Disorder[];
  /** The case currently shown, so the owning disorder reads as active. */
  activeCaseId: string | null;
  /** Select a disorder's first demo case. */
  onSelect: (caseId: string) => void;
}

/**
 * The study picker for step 2. Every disorder is listed; only those with a wired
 * demo case are selectable. Disorders without a case are shown disabled and
 * labelled, so the demo is honest about what evidence actually exists rather than
 * hiding the gaps.
 *
 * Responsive: a horizontal strip on small screens, a vertical rail on md+.
 */
export function DisorderList({
  disorders,
  activeCaseId,
  onSelect,
}: DisorderListProps) {
  return (
    <nav
      aria-label="Studies"
      className="scroll-thin flex gap-1.5 overflow-x-auto p-2 md:flex-col md:overflow-x-visible md:overflow-y-auto"
    >
      {disorders.map((disorder) => {
        const caseId = disorder.case_ids[0] ?? null;
        const hasCase = caseId !== null;
        const isActive = hasCase && caseId === activeCaseId;

        return (
          <button
            key={disorder.disorder_id}
            type="button"
            disabled={!hasCase}
            aria-pressed={isActive}
            onClick={() => hasCase && onSelect(caseId)}
            className={`shrink-0 rounded-md border px-3 py-2 text-left transition-colors md:w-full ${
              isActive
                ? "border-select/50 bg-select/15"
                : hasCase
                  ? "border-line bg-surface-0 hover:border-line-strong"
                  : "cursor-not-allowed border-dashed border-line bg-transparent opacity-60"
            }`}
          >
            <span
              className={`block text-[12.5px] font-medium ${
                isActive ? "text-select" : "text-ink"
              }`}
            >
              {disorder.name}
            </span>
            <span className="ident mt-0.5 block text-ink-faint">
              {hasCase
                ? RENDERER_LABEL[disorder.evidence_renderer]
                : "no demo case yet"}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
