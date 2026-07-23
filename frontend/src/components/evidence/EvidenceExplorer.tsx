"use client";

import { useEffect, useState } from "react";

import { DisorderList } from "@/components/evidence/DisorderList";
import { EvidenceView } from "@/components/evidence/EvidenceView";
import { loadCase } from "@/lib/contract/load";
import type { Case } from "@/lib/contract/types";
import { useAtlasStore } from "@/store/useAtlasStore";

/**
 * Step 2, the evidence explorer. Rendered in place of the atlas canvas (which is
 * unmounted first, so only one WebGL context is ever live), it lets a reviewer
 * pick a disorder's demo case and inspect the evidence behind it.
 *
 * The case JSON is fetched on demand when the active case changes — never
 * eagerly for every disorder — keeping with the progressive-load rule.
 */
export function EvidenceExplorer() {
  const disorders = useAtlasStore((s) => s.disorders);
  const activeCaseId = useAtlasStore((s) => s.activeCaseId);
  const setActiveCase = useAtlasStore((s) => s.setActiveCase);

  // Loaded state is tagged with its case id so a stale case never shows for a
  // newly-picked one, and no state is reset synchronously inside an effect.
  const [loaded, setLoaded] = useState<{ id: string; data: Case } | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(
    null,
  );

  // Default-select the first disorder that actually has a demo case, so opening
  // step 2 lands on something to look at rather than an empty stage.
  useEffect(() => {
    if (activeCaseId) return;
    const firstWithCase = disorders.find((d) => d.case_ids.length > 0);
    if (firstWithCase) setActiveCase(firstWithCase.case_ids[0]);
  }, [activeCaseId, disorders, setActiveCase]);

  // Fetch the active case on demand.
  useEffect(() => {
    if (!activeCaseId) return;
    let cancelled = false;

    loadCase(activeCaseId)
      .then((c) => {
        if (!cancelled) setLoaded({ id: activeCaseId, data: c });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error("[evidence] failed to load case", activeCaseId, err);
        setFailed({
          id: activeCaseId,
          message:
            err instanceof Error ? err.message : "Could not load the case.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [activeCaseId]);

  const activeCase =
    loaded && loaded.id === activeCaseId ? loaded.data : null;
  const error = failed && failed.id === activeCaseId ? failed.message : null;
  const hasAnyCase = disorders.some((d) => d.case_ids.length > 0);

  return (
    <div className="anim-fade flex min-h-0 flex-1 flex-col md:flex-row">
      <div className="shrink-0 border-b border-line bg-surface-1 md:w-56 md:border-b-0 md:border-r">
        <DisorderList
          disorders={disorders}
          activeCaseId={activeCaseId}
          onSelect={setActiveCase}
        />
      </div>

      {error ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
          <div className="max-w-sm space-y-1.5">
            <p className="t-read font-medium text-ink">
              Could not load this case
            </p>
            <p className="t-body leading-relaxed text-ink-muted">
              {error}
            </p>
          </div>
        </div>
      ) : !hasAnyCase ? (
        <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
          <p className="t-body max-w-sm leading-relaxed text-ink-muted">
            No demo cases are wired yet. Cases appear here as their datasets are
            processed.
          </p>
        </div>
      ) : activeCase ? (
        <EvidenceView activeCase={activeCase} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <p className="ident text-ink-faint">Loading case…</p>
        </div>
      )}
    </div>
  );
}
