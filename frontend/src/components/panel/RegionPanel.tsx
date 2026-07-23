"use client";

import { SourcedField } from "@/components/chrome/SourcedField";
import { RegionLinks } from "@/components/panel/RegionLinks";
import { useAtlasStore, useSelectedRegion } from "@/store/useAtlasStore";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="t-fine text-ink-faint">{label}</dt>
      <dd className="t-body text-right text-ink-muted">{value}</dd>
    </div>
  );
}

/**
 * Detail panel for the region currently selected in the atlas.
 *
 * Everything shown here comes from regions.json. The panel never derives or
 * infers anatomical meaning — the function description is rendered through
 * SourcedField, which shows a pending placeholder when no citation exists, and
 * the disorder links come only from cited typical-pattern data (RegionLinks).
 */
export function RegionPanel() {
  const region = useSelectedRegion();

  const isolatedRegionId = useAtlasStore((s) => s.isolatedRegionId);
  const hiddenRegionIds = useAtlasStore((s) => s.hiddenRegionIds);
  const isolateRegion = useAtlasStore((s) => s.isolateRegion);
  const hideRegion = useAtlasStore((s) => s.hideRegion);
  const unhideRegion = useAtlasStore((s) => s.unhideRegion);

  if (!region) {
    return (
      <div className="anim-fade flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="t-read text-ink-muted">No region selected</p>
        <p className="t-body max-w-60 leading-relaxed text-ink-faint">
          Click a region on the brain, or pick one from the index, to see its
          atlas record.
        </p>
      </div>
    );
  }

  const [x, y, z] = region.centroid_mni;
  const isIsolated = isolatedRegionId === region.region_id;
  const isHidden = hiddenRegionIds.has(region.region_id);

  return (
    <div key={region.region_id} className="anim-fade flex h-full flex-col">
      <header className="border-b border-line px-4 py-3.5">
        <h2 className="t-head-lg font-semibold leading-snug text-ink">
          {region.name}
        </h2>
        <p className="ident mt-1">{region.region_id}</p>

        {/* Dissection actions — isolate to view only this part, or peel it away. */}
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() =>
              isolateRegion(isIsolated ? null : region.region_id)
            }
            aria-pressed={isIsolated}
            className={`t-ctl rounded-md border px-2.5 py-1 transition-colors ${
              isIsolated
                ? "border-select/50 bg-select/15 text-select"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {isIsolated ? "Exit isolate" : "Isolate"}
          </button>
          <button
            type="button"
            onClick={() =>
              isHidden
                ? unhideRegion(region.region_id)
                : hideRegion(region.region_id)
            }
            aria-pressed={isHidden}
            className={`t-ctl rounded-md border px-2.5 py-1 transition-colors ${
              isHidden
                ? "border-pending/50 bg-pending/10 text-pending"
                : "border-line text-ink-muted hover:border-line-strong hover:text-ink"
            }`}
          >
            {isHidden ? "Restore" : "Hide"}
          </button>
        </div>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        <SourcedField
          label="Normal function"
          value={region.normal_function_description}
          citation={region.description_source}
        />

        <div className="mt-5 border-t border-line/60 pt-4">
          <RegionLinks regionId={region.region_id} />
        </div>

        <dl className="mt-5 divide-y divide-line/60 border-t border-line/60">
          <MetaRow label="Hemisphere" value={region.hemisphere} />
          <MetaRow label="Structure" value={region.structure_type} />
          <MetaRow label="Atlas" value={region.atlas_source} />
          <MetaRow
            label="Centroid (MNI)"
            value={`${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`}
          />
        </dl>

        <p className="t-fine mt-5 leading-relaxed text-ink-faint">
          Coordinates are the centroid of this region in the atlas mesh, not a
          measurement from any patient scan.
        </p>
      </div>
    </div>
  );
}
