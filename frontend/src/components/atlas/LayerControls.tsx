"use client";

import {
  useAtlasStore,
  BRAIN_LAYERS,
  DETAIL_LAYERS,
  type LayerKey,
} from "@/store/useAtlasStore";

const LAYER_LABELS: Record<LayerKey, string> = {
  cortical: "Cortex",
  subcortical: "Subcortical",
  // Not "Veins". The source model contains no cerebral veins at all -- no great
  // cerebral vein, no internal cerebral vein, no cortical veins -- only the
  // dural sinuses. Labelling this "Veins" would claim a cerebral venous anatomy
  // that is not in the mesh. The store key stays `veins` because it is wiring.
  veins: "Dural sinuses",
  arteries: "Arteries",
  nerves: "Cranial nerves",
};

/** What each detailing layer actually contains, for its tooltip. */
const LAYER_CONTENTS: Partial<Record<LayerKey, string>> = {
  veins:
    "Dural venous sinuses only (superior and inferior sagittal, straight, transverse, sigmoid, cavernous, petrosal). The source model has no cerebral veins.",
  arteries:
    "Cerebral arterial tree: circle of Willis, the anterior, middle and posterior cerebral arteries with named cortical branches, and the posterior fossa arteries.",
  nerves: "The twelve cranial nerves, clipped at the cranial cavity.",
};

function LayerToggle({
  layer,
  pending = false,
}: {
  layer: LayerKey;
  pending?: boolean;
}) {
  const active = useAtlasStore((s) => s.visibleLayers[layer]);
  const toggleLayer = useAtlasStore((s) => s.toggleLayer);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => toggleLayer(layer)}
      aria-pressed={active}
      title={
        pending
          ? "Detailing mesh not loaded yet — see docs/ASSET_SOURCING.md"
          : (LAYER_CONTENTS[layer] ?? `Toggle ${LAYER_LABELS[layer]} layer`)
      }
      className={`t-ctl flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
        pending
          ? "cursor-not-allowed text-ink-faint/60"
          : active
            ? "bg-select/15 text-select"
            : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
      }`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${
          pending
            ? "bg-ink-faint/40"
            : active
              ? "bg-select"
              : "bg-line-strong"
        }`}
      />
      {LAYER_LABELS[layer]}
      {pending && (
        <span className="ident t-micro uppercase tracking-wide text-ink-faint/70">
          soon
        </span>
      )}
    </button>
  );
}

/**
 * Layer visibility and dissection helpers for the atlas.
 *
 * Brain layers are live, and so are the three detailing layers, whose meshes
 * come from Z-Anatomy via backend/export_detailing.py. Their labels name what
 * the mesh actually contains rather than what the layer is called in the store
 * — see LAYER_LABELS.
 *
 * "Ghost cortex" fades the cortical surface so subcortical structures can be
 * seen and picked through it — a material opacity change only, never a geometry
 * change, per the rendering rules in frontend/CLAUDE.md.
 */
export function LayerControls() {
  const ghostCortex = useAtlasStore((s) => s.ghostCortex);
  const toggleGhostCortex = useAtlasStore((s) => s.toggleGhostCortex);
  const regionColorMode = useAtlasStore((s) => s.regionColorMode);
  const toggleRegionColorMode = useAtlasStore((s) => s.toggleRegionColorMode);

  return (
    <div className="panel anim-rise pointer-events-auto flex flex-col gap-1 p-1.5">
      <div className="flex items-center gap-0.5">
        <span className="ident t-micro px-1.5 uppercase tracking-[0.13em]">
          Brain
        </span>
        {BRAIN_LAYERS.map((layer) => (
          <LayerToggle key={layer} layer={layer} />
        ))}
        <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
        <button
          type="button"
          onClick={toggleGhostCortex}
          aria-pressed={ghostCortex}
          className={`t-ctl rounded px-2.5 py-1 transition-colors ${
            ghostCortex
              ? "bg-select/15 text-select"
              : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
          }`}
        >
          Ghost cortex
        </button>
        <button
          type="button"
          onClick={toggleRegionColorMode}
          aria-pressed={regionColorMode}
          title="Give every region its own colour for easy differentiation (visual aid only, no clinical meaning)"
          className={`t-ctl flex items-center gap-1.5 rounded px-2.5 py-1 transition-colors ${
            regionColorMode
              ? "bg-select/15 text-select"
              : "text-ink-faint hover:bg-surface-2 hover:text-ink-muted"
          }`}
        >
          <span
            aria-hidden
            className="h-2 w-2 rounded-full"
            style={{
              background: regionColorMode
                ? "conic-gradient(from 0deg, #f87171, #fbbf24, #34d399, #38bdf8, #a78bfa, #f87171)"
                : "var(--color-line-strong)",
            }}
          />
          Region colours
        </button>
      </div>

      <div className="flex items-center gap-0.5 border-t border-line/60 pt-1">
        <span className="ident t-micro px-1.5 uppercase tracking-[0.13em]">
          Detailing
        </span>
        {DETAIL_LAYERS.map((layer) => (
          <LayerToggle key={layer} layer={layer} />
        ))}
      </div>
    </div>
  );
}
