"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { AtlasSkeleton } from "@/components/atlas/AtlasSkeleton";
import { DissectionBar } from "@/components/atlas/DissectionBar";
import { HoverReadout } from "@/components/atlas/HoverReadout";
import { LayerControls } from "@/components/atlas/LayerControls";
import { ViewControls } from "@/components/atlas/ViewControls";
import { Drawer } from "@/components/chrome/Drawer";
import { ReviewBanner } from "@/components/chrome/ReviewBanner";
import { TopBar } from "@/components/chrome/TopBar";
import { RegionIndex } from "@/components/panel/RegionIndex";
import { RegionPanel } from "@/components/panel/RegionPanel";
import { loadDisorders, loadRegions } from "@/lib/contract/load";
import { getStoredTheme } from "@/lib/theme";
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

// Step 2 is code-split and client-only: it pulls in Niivue, which must never
// enter the atlas chunk or the server bundle. It mounts only when the user
// enters evidence mode, by which point the atlas canvas is unmounted.
const EvidenceExplorer = dynamic(
  () =>
    import("@/components/evidence/EvidenceExplorer").then(
      (m) => m.EvidenceExplorer,
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <p className="ident text-ink-faint">Opening evidence viewer…</p>
      </div>
    ),
  },
);

export function AtlasExplorer() {
  const regions = useAtlasStore((s) => s.regions);
  const disorders = useAtlasStore((s) => s.disorders);
  const setRegions = useAtlasStore((s) => s.setRegions);
  const setDisorders = useAtlasStore((s) => s.setDisorders);
  const loadError = useAtlasStore((s) => s.loadError);
  const setLoadError = useAtlasStore((s) => s.setLoadError);
  const setTheme = useAtlasStore((s) => s.setTheme);
  const mode = useAtlasStore((s) => s.mode);
  const enterEvidence = useAtlasStore((s) => s.enterEvidence);
  const exitEvidence = useAtlasStore((s) => s.exitEvidence);

  const [isLoading, setIsLoading] = useState(true);
  // Small-screen access to the rails the layout undocks (index < lg, detail
  // < md). Docked at desktop width, so these stay closed there.
  const [indexOpen, setIndexOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // Reconcile the store to the persisted theme after hydration. localStorage is
  // the source of truth: the pre-paint head script already set <html data-theme>
  // from it, but React hydration can drop that attribute (it is not a
  // React-controlled prop), so we re-apply it here and align the store in one
  // step. Running post-mount also avoids an SSR/client markup mismatch.
  useEffect(() => {
    setTheme(getStoredTheme());
  }, [setTheme]);

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

    // Disorders are small and drive the region panel's linked-disorder section.
    // A failure here is non-fatal to the atlas, so it is logged, not surfaced.
    loadDisorders()
      .then((loaded) => {
        if (!cancelled) setDisorders(loaded);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          console.error("[contract] failed to load disorders.json", error);
      });

    return () => {
      cancelled = true;
    };
  }, [setRegions, setDisorders, setLoadError]);

  const pendingCount = regions.filter(
    (r) => r.review_status !== "reviewed",
  ).length;

  const hasEvidence = disorders.some((d) => d.case_ids.length > 0);

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
      <TopBar
        pendingCount={pendingCount}
        mode={mode}
        hasEvidence={hasEvidence}
        onOpenIndex={() => setIndexOpen(true)}
        onOpenDetail={() => setDetailOpen(true)}
        onEnterEvidence={() => enterEvidence()}
        onExitEvidence={exitEvidence}
      />
      <ReviewBanner pendingCount={pendingCount} />

      {mode === "evidence" ? (
        <EvidenceExplorer />
      ) : (
        <>
      <div className="flex min-h-0 flex-1">
        <aside
          aria-label="Region index"
          className="hidden w-64 shrink-0 border-r border-line bg-surface-1 lg:block"
        >
          <RegionIndex />
        </aside>

        <div className="stage relative min-w-0 flex-1">
          {/* The atlas is the interface: full-bleed canvas, tools floating over it. */}
          {isLoading ? <AtlasSkeleton /> : <AtlasCanvas />}

          {/* On-stage tools. Desktop: layers top-right, views centred on the
              same row. Small screens: layers span the top as a scrollable strip
              and views drop below them, so neither overflows or overlaps. Each
              wrapper scrolls horizontally rather than forcing the page wider. */}
          <div className="pointer-events-none absolute left-3 right-3 top-3 flex justify-center overflow-x-auto lg:left-auto lg:justify-end">
            <LayerControls />
          </div>

          <div className="pointer-events-none absolute inset-x-0 top-19 flex justify-center overflow-x-auto px-3">
            <ViewControls />
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3">
            <HoverReadout />
          </div>

          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <DissectionBar />
          </div>

          <p className="ident pointer-events-none absolute bottom-3 right-3 hidden text-right md:block">
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

      {/* Small-screen rails: temporary overlays over the same content. */}
      <Drawer
        open={indexOpen}
        onClose={() => setIndexOpen(false)}
        side="left"
        label="Region index"
      >
        <RegionIndex />
      </Drawer>
      <Drawer
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        side="right"
        label="Region detail"
      >
        <RegionPanel />
      </Drawer>
        </>
      )}
    </main>
  );
}
