"use client";

import { useCallback, useEffect, useId, useRef } from "react";

import type { Disorder } from "@/lib/contract/types";

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  /** Drives the honest, data-derived "what is wired" status. */
  disorders: Disorder[];
}

/** One row of the honesty legend: a swatch in a reserved semantic hue plus what
 *  that hue means. The colour language is the product's trust signal, so it is
 *  stated here verbatim against the same tokens the rest of the UI uses. */
function LegendRow({
  swatch,
  term,
  meaning,
}: {
  swatch: string;
  term: string;
  meaning: string;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className={`mt-1 size-2.5 shrink-0 rounded-full ${swatch}`}
      />
      <p className="t-body leading-relaxed text-ink-muted">
        <span className="font-medium text-ink">{term}</span> — {meaning}
      </p>
    </li>
  );
}

/**
 * "About this demo" — the orientation and honesty surface.
 *
 * It frames the two-step method and, crucially, how to read the evidence: the
 * four reserved hues (selection, computed, cited, pending) are the only way a
 * reviewer tells a segmented finding from a literature-level pattern from an
 * unsourced placeholder (docs/MEDICAL_ACCURACY.md). It states method and posture
 * only — never an anatomical claim — and reports what is wired straight from the
 * loaded data rather than asserting it.
 *
 * A modal dialog: role="dialog", aria-modal, Esc to close, backdrop click to
 * close, focus moved in on open, trapped while open, and returned to the trigger
 * on close.
 */
export function AboutDialog({ open, onClose, disorders }: AboutDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const focusable = useCallback((): HTMLElement[] => {
    const root = dialogRef.current;
    if (!root) return [];
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((el) => !el.hasAttribute("disabled"));
  }, []);

  // Move focus into the dialog on open; return it to the opener on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  // Esc closes; Tab is trapped within the dialog so keyboard focus never lands
  // on the atlas behind it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, focusable]);

  if (!open) return null;

  const wired = disorders.filter((d) => d.case_ids.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close about this demo"
        onClick={onClose}
        className="anim-fade absolute inset-0 bg-void/70 backdrop-blur-sm"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="panel anim-pop relative flex max-h-[85dvh] w-full max-w-lg flex-col overflow-hidden"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <h2 id={titleId} className="t-head font-semibold text-ink">
              About this demo
            </h2>
            <p className="ident mt-0.5">Brain digital twin · proof of concept</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close about this demo"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </header>

        <div className="scroll-thin flex-1 space-y-5 overflow-y-auto px-5 py-4">
          <p className="t-body leading-relaxed text-ink-muted">
            Explore a normal brain by region, then switch into a disorder&rsquo;s
            de-identified case and see exactly which regions changed — with every
            highlighted region traceable back to the real scan, EEG, or report it
            came from.
          </p>

          <section className="space-y-2">
            <h3 className="t-tag font-medium uppercase tracking-[0.13em] text-ink-faint">
              The two steps
            </h3>
            <ol className="space-y-1.5">
              <li className="t-body flex gap-2.5 leading-relaxed text-ink-muted">
                <span className="ident mt-px shrink-0 text-select">1</span>
                <span>
                  <span className="font-medium text-ink">
                    Explore the normal brain.
                  </span>{" "}
                  Click any region, or search the index, for its atlas record.
                </span>
              </li>
              <li className="t-body flex gap-2.5 leading-relaxed text-ink-muted">
                <span className="ident mt-px shrink-0 text-select">2</span>
                <span>
                  <span className="font-medium text-ink">
                    Switch into a disorder&rsquo;s case.
                  </span>{" "}
                  Inspect the real scan, EEG, or report behind it, and how each
                  region traces back to it.
                </span>
              </li>
            </ol>
          </section>

          <section className="space-y-2">
            <h3 className="t-tag font-medium uppercase tracking-[0.13em] text-ink-faint">
              How to read the evidence
            </h3>
            <ul className="space-y-2 rounded-md border border-line bg-surface-0/50 px-3 py-3">
              <LegendRow
                swatch="bg-select"
                term="selection"
                meaning="your current pick; an interaction cue, not a clinical claim."
              />
              <LegendRow
                swatch="bg-computed"
                term="computed"
                meaning="this patient's mask overlapped with the atlas, shown with its overlap metric."
              />
              <LegendRow
                swatch="bg-cited"
                term="typical / cited"
                meaning="a literature-level pattern with a citation — never segmented from this patient."
              />
              <LegendRow
                swatch="bg-pending"
                term="pending"
                meaning="no cited source yet; awaiting expert sign-off, not clinical fact."
              />
            </ul>
          </section>

          <section className="space-y-2">
            <h3 className="t-tag font-medium uppercase tracking-[0.13em] text-ink-faint">
              What is wired
            </h3>
            <p className="t-body leading-relaxed text-ink-muted">
              {wired.length} of {disorders.length} disorders have a wired demo
              case. The rest are listed so the demo is honest about the gaps
              rather than hiding them.
            </p>
            <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {disorders.map((disorder) => {
                const hasCase = disorder.case_ids.length > 0;
                return (
                  <li
                    key={disorder.disorder_id}
                    className="t-body flex items-center gap-2 text-ink-muted"
                  >
                    <span
                      aria-hidden
                      className={`size-1.5 shrink-0 rounded-full ${
                        hasCase ? "bg-computed" : "bg-line-strong"
                      }`}
                    />
                    <span className={hasCase ? "text-ink" : "text-ink-faint"}>
                      {disorder.name}
                    </span>
                    {!hasCase && (
                      <span className="ident ml-auto text-ink-faint">
                        no case yet
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          <p className="t-ctl rounded-md border border-pending/25 bg-pending/[0.06] px-3 py-2.5 leading-relaxed text-pending/90">
            Everything here is pending expert review. Nothing has been signed off
            by a neurologist, and nothing shown is a diagnosis.
          </p>
        </div>

        <footer className="flex justify-end border-t border-line px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="t-body transform-gpu rounded-md border border-select/40 bg-select/10 px-3.5 py-1.5 font-medium text-select transition-[background-color,transform,box-shadow] duration-200 hover:-translate-y-px hover:bg-select/20 hover:shadow-[0_6px_16px_-8px_var(--color-select)]"
          >
            Start exploring
          </button>
        </footer>
      </div>
    </div>
  );
}
