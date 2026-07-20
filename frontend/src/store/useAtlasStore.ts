"use client";

import { create } from "zustand";
import type { Region } from "@/lib/contract/types";
import { indexRegions } from "@/lib/contract/load";

export type LayerKey = "cortical" | "subcortical";

interface AtlasState {
  regions: Region[];
  regionsById: Map<string, Region>;
  loadError: string | null;

  /** Committed selection — drives the detail panel. */
  selectedRegionId: string | null;
  /** Transient hover — drives the cursor readout only, never the panel. */
  hoveredRegionId: string | null;

  visibleLayers: Record<LayerKey, boolean>;
  /**
   * Fade the cortex so subcortical structures can be seen and picked through
   * it. Implemented as a material opacity change, never a geometry change.
   */
  ghostCortex: boolean;

  setRegions: (regions: Region[]) => void;
  setLoadError: (message: string | null) => void;
  selectRegion: (regionId: string | null) => void;
  hoverRegion: (regionId: string | null) => void;
  toggleLayer: (layer: LayerKey) => void;
  toggleGhostCortex: () => void;
}

export const useAtlasStore = create<AtlasState>((set) => ({
  regions: [],
  regionsById: new Map(),
  loadError: null,
  selectedRegionId: null,
  hoveredRegionId: null,
  visibleLayers: { cortical: true, subcortical: true },
  ghostCortex: false,

  setRegions: (regions) =>
    set({ regions, regionsById: indexRegions(regions), loadError: null }),

  setLoadError: (message) => set({ loadError: message }),

  selectRegion: (regionId) => set({ selectedRegionId: regionId }),

  hoverRegion: (regionId) => set({ hoveredRegionId: regionId }),

  toggleLayer: (layer) =>
    set((state) => ({
      visibleLayers: {
        ...state.visibleLayers,
        [layer]: !state.visibleLayers[layer],
      },
    })),

  toggleGhostCortex: () =>
    set((state) => ({ ghostCortex: !state.ghostCortex })),
}));

/** Convenience selector — the currently selected Region record, if any. */
export function useSelectedRegion(): Region | null {
  return useAtlasStore((s) =>
    s.selectedRegionId ? (s.regionsById.get(s.selectedRegionId) ?? null) : null,
  );
}
