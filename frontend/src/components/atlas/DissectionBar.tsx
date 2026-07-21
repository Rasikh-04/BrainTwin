"use client";

import { useAtlasStore } from "@/store/useAtlasStore";

/**
 * A quiet status chip that only appears while the model is dissected — either a
 * region is isolated ("view only this part") or one or more regions are hidden.
 * It names the current cut and offers a single reset back to the whole model,
 * so a user can never get stranded in a partial view with no way out.
 */
export function DissectionBar() {
  const isolatedRegionId = useAtlasStore((s) => s.isolatedRegionId);
  const hiddenCount = useAtlasStore((s) => s.hiddenRegionIds.size);
  const regionsById = useAtlasStore((s) => s.regionsById);
  const clearDissection = useAtlasStore((s) => s.clearDissection);

  const isDissected = isolatedRegionId !== null || hiddenCount > 0;
  if (!isDissected) return null;

  const isolatedName = isolatedRegionId
    ? (regionsById.get(isolatedRegionId)?.name ?? isolatedRegionId)
    : null;

  const parts: string[] = [];
  if (isolatedName) parts.push(`Isolated: ${isolatedName}`);
  if (hiddenCount > 0)
    parts.push(`${hiddenCount} region${hiddenCount > 1 ? "s" : ""} hidden`);

  return (
    <div className="panel pointer-events-auto flex items-center gap-3 px-3 py-1.5">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-pending" />
      <span className="text-[11.5px] text-ink-muted">{parts.join(" · ")}</span>
      <button
        type="button"
        onClick={clearDissection}
        className="rounded px-2 py-0.5 text-[11.5px] text-select transition-colors hover:bg-select/15"
      >
        Reset model
      </button>
    </div>
  );
}
