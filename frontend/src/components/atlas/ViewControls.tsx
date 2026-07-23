"use client";

import { useAtlasStore, type ViewPreset } from "@/store/useAtlasStore";

const PRESETS: { key: ViewPreset; label: string }[] = [
  { key: "sagittal", label: "Sagittal" },
  { key: "coronal", label: "Coronal" },
  { key: "axial", label: "Axial" },
  { key: "anterolateral", label: "3/4" },
];

/**
 * Standard anatomical viewpoints plus a focus modifier.
 *
 * The presets snap the camera to a plane (sagittal profile, coronal front,
 * axial top, or the readable three-quarter default). "Focus selected" decides
 * what the camera centres on: off frames the whole brain, on brings the picked
 * region to the front — the sagittal-style close-up, made an explicit choice.
 */
export function ViewControls() {
  const viewPreset = useAtlasStore((s) => s.viewPreset);
  const applyView = useAtlasStore((s) => s.applyView);
  const focusSelected = useAtlasStore((s) => s.focusSelected);
  const toggleFocusSelected = useAtlasStore((s) => s.toggleFocusSelected);
  const hasSelection = useAtlasStore((s) => s.selectedRegionId !== null);

  return (
    <div className="panel anim-rise pointer-events-auto flex items-center gap-2 p-1.5">
      <div className="segment">
        {PRESETS.map(({ key, label }) => {
          const active = viewPreset === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => applyView(key)}
              aria-pressed={active}
              className={`t-ctl rounded-[6px] px-2.5 py-1 transition-colors ${
                active
                  ? "bg-select/20 text-select"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={toggleFocusSelected}
        aria-pressed={focusSelected}
        disabled={!hasSelection && !focusSelected}
        title={
          hasSelection || focusSelected
            ? "Frame the selected region instead of the whole brain"
            : "Select a region first"
        }
        className={`t-ctl rounded px-2.5 py-1 transition-colors ${
          focusSelected
            ? "bg-select/15 text-select"
            : hasSelection
              ? "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
              : "cursor-not-allowed text-ink-faint/50"
        }`}
      >
        Focus selected
      </button>
    </div>
  );
}
