"use client";

import { useAtlasStore, type LayerKey } from "@/store/useAtlasStore";

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded px-2.5 py-1 text-[11.5px] transition-colors ${
        active
          ? "bg-select/15 text-select"
          : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Layer visibility for the atlas.
 *
 * "Ghost cortex" fades the cortical surface so subcortical structures can be
 * seen and picked through it — a material opacity change only, never a geometry
 * change, per the rendering rules in frontend/CLAUDE.md.
 */
export function LayerControls() {
  const visibleLayers = useAtlasStore((s) => s.visibleLayers);
  const toggleLayer = useAtlasStore((s) => s.toggleLayer);
  const ghostCortex = useAtlasStore((s) => s.ghostCortex);
  const toggleGhostCortex = useAtlasStore((s) => s.toggleGhostCortex);

  const layers: { key: LayerKey; label: string }[] = [
    { key: "cortical", label: "Cortex" },
    { key: "subcortical", label: "Subcortical" },
  ];

  return (
    <div className="panel pointer-events-auto flex items-center gap-0.5 p-1">
      {layers.map(({ key, label }) => (
        <Toggle
          key={key}
          active={visibleLayers[key]}
          onClick={() => toggleLayer(key)}
        >
          {label}
        </Toggle>
      ))}
      <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
      <Toggle active={ghostCortex} onClick={toggleGhostCortex}>
        Ghost cortex
      </Toggle>
    </div>
  );
}
