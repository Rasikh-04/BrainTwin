"use client";

import { AtrophyPair } from "@/components/evidence/renderers/AtrophyPair";
import { EegView } from "@/components/evidence/renderers/EegView";
import { LesionOverlay } from "@/components/evidence/renderers/LesionOverlay";
import { RegionMappings } from "@/components/evidence/RegionMappings";
import { SourcedField } from "@/components/chrome/SourcedField";
import type { Case, Evidence } from "@/lib/contract/types";

/**
 * Pick the step-2 view from the renderer alone. Adding a disorder never adds a
 * branch here — a new disorder maps onto one of these three renderers via its
 * data (frontend/CLAUDE.md). The switch is exhaustive over EvidenceRenderer, so
 * the compiler flags any future renderer that is added without a view.
 */
function renderEvidence(evidence: Evidence) {
  switch (evidence.renderer) {
    case "lesion-overlay":
      return <LesionOverlay evidence={evidence} />;
    case "atrophy-pair":
      return <AtrophyPair evidence={evidence} />;
    case "eeg":
      return <EegView evidence={evidence} />;
    default: {
      const _exhaustive: never = evidence;
      return _exhaustive;
    }
  }
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className="text-right text-[12px] text-ink-muted">{value}</dd>
    </div>
  );
}

/**
 * One case's evidence: the renderer surface on the left, and the traceability
 * column on the right (report summary and the involved-region mappings). The
 * report is passed through SourcedField, so an unsourced summary shows the
 * pending placeholder rather than a blank or an invented one.
 */
export function EvidenceView({ activeCase }: { activeCase: Case }) {
  const meta = activeCase.anonymized_meta;

  return (
    <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
      {/* Keyed by case so switching studies fully remounts the renderer, which
          disposes any prior Niivue WebGL context instead of reusing it. */}
      <div
        key={activeCase.case_id}
        className="relative min-h-0 flex-1 border-b border-line lg:border-b-0 lg:border-r"
      >
        {renderEvidence(activeCase.evidence)}
      </div>

      <aside
        aria-label="Case evidence detail"
        className="scroll-thin flex max-h-[45%] shrink-0 flex-col overflow-y-auto bg-surface-1 lg:max-h-none lg:w-80"
      >
        <header className="border-b border-line px-4 py-3.5">
          <h2 className="text-[15px] font-semibold leading-snug text-ink">
            {activeCase.case_id}
          </h2>
          <p className="ident mt-1">
            {activeCase.source_dataset} &middot; {activeCase.evidence.renderer}
          </p>
        </header>

        <div className="space-y-5 px-4 py-4">
          <SourcedField
            label="Report summary"
            value={activeCase.report_summary}
          />

          <div className="border-t border-line/60 pt-4">
            <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.13em] text-ink-faint">
              Involved regions
            </h3>
            <RegionMappings mappings={activeCase.region_mappings} />
          </div>

          {(meta.age_band || meta.sex) && (
            <dl className="divide-y divide-line/60 border-t border-line/60">
              {meta.age_band && (
                <MetaRow label="Age band" value={meta.age_band} />
              )}
              {meta.sex && <MetaRow label="Sex" value={meta.sex} />}
            </dl>
          )}

          <p className="text-[11px] leading-relaxed text-ink-faint">
            De-identified case data shown for demonstration, pending expert
            review. Nothing here is a diagnosis.
          </p>
        </div>
      </aside>
    </div>
  );
}
