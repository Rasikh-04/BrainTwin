"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { AtlasSkeleton } from "@/components/atlas/AtlasSkeleton";
import { HoverReadout } from "@/components/atlas/HoverReadout";
import { LayerControls } from "@/components/atlas/LayerControls";
import { ReviewBanner } from "@/components/chrome/ReviewBanner";
import { RegionIndex } from "@/components/panel/RegionIndex";
import { RegionPanel } from "@/components/panel/RegionPanel";
import { loadRegions } from "@/lib/contract/load";
import { useAtlasStore } from "@/store/useAtlasStore";

/**
 * Step 1 of the two-step UX: explore a normal brain by region.
 *
 * The WebGL canvas is client-only and code-split. Step 2's Niivue viewer will
 * mount in place of this canvas rather than alongside it — the two WebGL
 * contexts must never render at the same time (docs/ARCHITECTURE.md).
 */
const AtlasCanvas = dynamic(
  () => import("@/components/atlas/AtlasCanvas").then((m) => m.AtlasCanvas),
  { ssr: false, loading: () => <AtlasSkeleton /> },
);

export function AtlasExplorer() {
  const regions = useAtlasStore((s) => s.regions);
  const setRegions = useAtlasStore((s) => s.setRegions);
  const loadError = useAtlasStore((s) => s.loadError);
  const setLoadError = useAtlasStore((s) => s.setLoadError);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    loadRegions()
      .then((loaded) => {
        if (!cancelled) setRegions(loaded);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // Surfaced, never swallowed: a failed contract load means the atlas
        // would render regions it cannot describe or attribute.
        console.error("[contract] failed to load regions.json", error);
        setLoadError(
          error instanceof Error ? error.message : "Unknown load failure",
        );
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [setRegions, setLoadError]);

  const pendingCount = regions.filter(
    (r) => r.review_status !== "reviewed",
  ).length;

  if (loadError) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-[15px] text-ink">Could not load the atlas catalog</h1>
        <p className="max-w-md text-[12.5px] leading-relaxed text-ink-muted">
          {loadError}
        </p>
        <p className="ident max-w-md">
          Expected /data/regions.json. Regenerate it with
          &nbsp;python3 backend/build_dataset.py
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-dvh flex-col bg-void">
      <ReviewBanner pendingCount={pendingCount} />

      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Region index"
          className="hidden w-64 shrink-0 border-r border-line bg-surface-1 lg:block"
        >
          <RegionIndex />
        </aside>

        <div className="relative min-w-0 flex-1">
          {/* The atlas is the interface: full-bleed canvas, chrome floating over it. */}
          {isLoading ? <AtlasSkeleton /> : <AtlasCanvas />}

          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
            <header className="panel pointer-events-auto px-3 py-2">
              <h1 className="text-[13px] font-medium leading-none text-ink">
                BrainTwin
              </h1>
              <p className="ident mt-1">Atlas explorer &middot; normal brain</p>
            </header>
            <LayerControls />
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3">
            <HoverReadout />
          </div>

          <p className="ident pointer-events-none absolute bottom-3 right-3 text-right">
            Drag to rotate &middot; scroll to zoom
          </p>
        </div>

        <aside
          aria-label="Region detail"
          className="hidden w-80 shrink-0 border-l border-line bg-surface-1 md:block"
        >
          <RegionPanel />
        </aside>
      </div>
    </main>
  );
}
