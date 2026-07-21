"use client";

import { create } from "zustand";
import type { Disorder, Region } from "@/lib/contract/types";
import { indexRegions } from "@/lib/contract/load";
import { applyTheme, DEFAULT_THEME, type Theme } from "@/lib/theme";

/**
 * Renderable layers of the model. `cortical` and `subcortical` are the real
 * brain meshes. The three detailing layers are wired now but their meshes are
 * sourced later (see docs/ASSET_SOURCING.md); until an asset is present they
 * render nothing, so toggling them is harmless.
 */
export type LayerKey =
  | "cortical"
  | "subcortical"
  | "veins"
  | "arteries"
  | "nerves";

export const BRAIN_LAYERS: LayerKey[] = ["cortical", "subcortical"];
export const DETAIL_LAYERS: LayerKey[] = ["veins", "arteries", "nerves"];

/**
 * Standard anatomical viewpoints plus a free camera. `focus` is not a viewpoint
 * but a modifier: when on, the camera frames the selected region (a sagittal-
 * style close-up that brings the picked structure to the front) instead of the
 * whole-brain centre.
 */
export type ViewPreset = "sagittal" | "coronal" | "axial" | "anterolateral";

/**
 * The two-step UX. `atlas` is the R3F normal-brain explorer (step 1); `evidence`
 * is the Niivue/EEG case viewer (step 2). They never render together: switching
 * to `evidence` unmounts the atlas canvas so only one WebGL context is ever live
 * (frontend/CLAUDE.md).
 */
export type ExplorerMode = "atlas" | "evidence";

interface AtlasState {
  regions: Region[];
  regionsById: Map<string, Region>;
  /**
   * Loaded eagerly (the file is tiny) so the region panel can show which
   * disorders reference a region. Case-level computed mappings stay lazy and
   * belong to the step-2 evidence view.
   */
  disorders: Disorder[];
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
  /**
   * Recolour every region with its own distinct hue for easy differentiation.
   * A purely visual aid (see lib/atlas/regionColor.ts); it asserts nothing
   * clinical and is separate from the reserved involvement hues used in step 2.
   */
  regionColorMode: boolean;

  /**
   * Dissection. `isolatedRegionId` shows only that one region and hides
   * everything else (the "view only this part" request). `hiddenRegionIds`
   * is the set of individually removed regions (the "dissect / remove" request).
   * The two are independent: you can isolate one region, or peel several away.
   */
  isolatedRegionId: string | null;
  hiddenRegionIds: Set<string>;

  /** Which standard view the camera should snap to, and a nonce to re-trigger. */
  viewPreset: ViewPreset;
  viewNonce: number;
  /** When true, frame the selected region instead of centring the whole brain. */
  focusSelected: boolean;

  /** Active surface theme. Initialised to the default for a stable SSR/first
   *  render, then reconciled from localStorage on mount (the pre-paint script
   *  already set the DOM attribute; AtlasExplorer syncs the store to it). */
  theme: Theme;

  /** Which step is on screen. See ExplorerMode. */
  mode: ExplorerMode;
  /**
   * Case selected for the step-2 evidence view. Null in atlas mode and until a
   * study is picked. The case JSON itself is fetched on demand by the evidence
   * view, never eagerly — this holds only the id.
   */
  activeCaseId: string | null;

  setRegions: (regions: Region[]) => void;
  setDisorders: (disorders: Disorder[]) => void;
  setLoadError: (message: string | null) => void;
  selectRegion: (regionId: string | null) => void;
  hoverRegion: (regionId: string | null) => void;
  toggleLayer: (layer: LayerKey) => void;
  toggleGhostCortex: () => void;
  toggleRegionColorMode: () => void;

  isolateRegion: (regionId: string | null) => void;
  hideRegion: (regionId: string) => void;
  unhideRegion: (regionId: string) => void;
  clearDissection: () => void;

  applyView: (preset: ViewPreset) => void;
  toggleFocusSelected: () => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;

  /** Enter step 2. Optionally jump straight to a specific case. */
  enterEvidence: (caseId?: string) => void;
  /** Return to step 1 and drop the active case. */
  exitEvidence: () => void;
  /** Change which case the evidence view is showing. */
  setActiveCase: (caseId: string | null) => void;
}

export const useAtlasStore = create<AtlasState>((set) => ({
  regions: [],
  regionsById: new Map(),
  disorders: [],
  loadError: null,
  selectedRegionId: null,
  hoveredRegionId: null,
  visibleLayers: {
    cortical: true,
    subcortical: true,
    veins: false,
    arteries: false,
    nerves: false,
  },
  ghostCortex: false,
  regionColorMode: false,

  isolatedRegionId: null,
  hiddenRegionIds: new Set(),

  viewPreset: "anterolateral",
  viewNonce: 0,
  focusSelected: false,
  theme: DEFAULT_THEME,

  mode: "atlas",
  activeCaseId: null,

  setRegions: (regions) =>
    set({ regions, regionsById: indexRegions(regions), loadError: null }),

  setDisorders: (disorders) => set({ disorders }),

  setLoadError: (message) => set({ loadError: message }),

  // Selecting a region frames it (the "bring it to the front" behaviour);
  // clearing the selection returns the camera to the whole-brain view.
  selectRegion: (regionId) =>
    set({ selectedRegionId: regionId, focusSelected: regionId !== null }),

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

  toggleRegionColorMode: () =>
    set((state) => ({ regionColorMode: !state.regionColorMode })),

  isolateRegion: (regionId) => set({ isolatedRegionId: regionId }),

  hideRegion: (regionId) =>
    set((state) => {
      const next = new Set(state.hiddenRegionIds);
      next.add(regionId);
      return { hiddenRegionIds: next };
    }),

  unhideRegion: (regionId) =>
    set((state) => {
      const next = new Set(state.hiddenRegionIds);
      next.delete(regionId);
      return { hiddenRegionIds: next };
    }),

  clearDissection: () =>
    set({ isolatedRegionId: null, hiddenRegionIds: new Set() }),

  applyView: (preset) =>
    set((state) => ({ viewPreset: preset, viewNonce: state.viewNonce + 1 })),

  toggleFocusSelected: () =>
    set((state) => ({ focusSelected: !state.focusSelected })),

  setTheme: (theme) => {
    applyTheme(theme);
    set({ theme });
  },

  toggleTheme: () =>
    set((state) => {
      const next: Theme = state.theme === "light" ? "dark" : "light";
      applyTheme(next);
      return { theme: next };
    }),

  enterEvidence: (caseId) =>
    set((state) => ({
      mode: "evidence",
      activeCaseId: caseId ?? state.activeCaseId,
    })),

  exitEvidence: () => set({ mode: "atlas", activeCaseId: null }),

  setActiveCase: (activeCaseId) => set({ activeCaseId }),
}));

/** Convenience selector — the currently selected Region record, if any. */
export function useSelectedRegion(): Region | null {
  return useAtlasStore((s) =>
    s.selectedRegionId ? (s.regionsById.get(s.selectedRegionId) ?? null) : null,
  );
}
