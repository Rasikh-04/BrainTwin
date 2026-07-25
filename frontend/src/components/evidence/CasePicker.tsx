"use client";

import type { DisorderCaseRef } from "@/lib/contract/types";

interface CasePickerProps {
  /** The cases of the active disorder, in contract order. */
  cases: DisorderCaseRef[];
  /** The case currently shown. */
  activeCaseId: string | null;
  /** Switch to another case of the same disorder. */
  onSelect: (caseId: string) => void;
}

/**
 * A within-disorder case switcher for step 2. A single disorder can carry
 * several de-identified cases that differ in lesion position and size (or in
 * severity, or seizure onset); this strip surfaces them so the reviewer sees
 * that the mapping varies per case rather than being one canned example.
 *
 * Each button's text is the backend-derived `label` (top overlap region + size,
 * CDR severity, or seizure onset) — never authored here — with the case_id as a
 * fallback. The parent renders this only when a disorder has more than one case,
 * so a single-case disorder shows no chrome.
 */
export function CasePicker({ cases, activeCaseId, onSelect }: CasePickerProps) {
  return (
    <div className="shrink-0 border-b border-line bg-surface-1 px-2 py-1.5">
      <div
        role="group"
        aria-label="Cases in this study"
        className="scroll-thin flex items-center gap-1 overflow-x-auto"
      >
        <span className="ident shrink-0 pr-1 pl-1 text-ink-faint">Case</span>
        {cases.map((c) => {
          const isActive = c.case_id === activeCaseId;
          return (
            <button
              key={c.case_id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(c.case_id)}
              title={c.label || c.case_id}
              className={`shrink-0 rounded border px-2.5 py-1 text-left transition-[color,background-color,border-color] duration-150 ${
                isActive
                  ? "border-select/50 bg-select/15 text-select"
                  : "border-line bg-surface-0 text-ink-muted hover:border-line-strong hover:text-ink"
              }`}
            >
              <span className="t-fine block font-medium whitespace-nowrap">
                {c.label || c.case_id}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
