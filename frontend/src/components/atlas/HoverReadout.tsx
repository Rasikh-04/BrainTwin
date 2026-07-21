"use client";

import { useAtlasStore } from "@/store/useAtlasStore";

/**
 * Names the region under the cursor.
 *
 * Isolated into its own tiny component on purpose: hover changes re-render this
 * and nothing else. The 3D scene applies hover highlighting imperatively
 * through a store subscription, so it never re-renders on pointer move.
 */
export function HoverReadout() {
  const hoveredRegionId = useAtlasStore((s) => s.hoveredRegionId);
  const region = useAtlasStore((s) =>
    s.hoveredRegionId ? s.regionsById.get(s.hoveredRegionId) : undefined,
  );

  if (!hoveredRegionId) return null;

  return (
    <div className="panel pointer-events-none px-2.5 py-1.5">
      <p className="text-[12px] leading-tight text-ink">
        {region?.name ?? hoveredRegionId}
      </p>
      <p className="ident mt-0.5">{hoveredRegionId}</p>
    </div>
  );
}
