"use client";

import { SourcedField } from "@/components/chrome/SourcedField";
import { useSelectedRegion } from "@/store/useAtlasStore";

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="text-[11px] text-ink-faint">{label}</dt>
      <dd className="text-right text-[12px] text-ink-muted">{value}</dd>
    </div>
  );
}

/**
 * Detail panel for the region currently selected in the atlas.
 *
 * Everything shown here comes from regions.json. The panel never derives or
 * infers anatomical meaning — the function description is rendered through
 * SourcedField, which shows a pending placeholder when no citation exists.
 */
export function RegionPanel() {
  const region = useSelectedRegion();

  if (!region) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[13px] text-ink-muted">No region selected</p>
        <p className="max-w-[15rem] text-[12px] leading-relaxed text-ink-faint">
          Click a region on the brain, or pick one from the index, to see its
          atlas record.
        </p>
      </div>
    );
  }

  const [x, y, z] = region.centroid_mni;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-4 py-3.5">
        <h2 className="text-[15px] font-medium leading-snug text-ink">
          {region.name}
        </h2>
        <p className="ident mt-1">{region.region_id}</p>
      </header>

      <div className="scroll-thin flex-1 overflow-y-auto px-4 py-4">
        <SourcedField
          label="Normal function"
          value={region.normal_function_description}
          citation={region.description_source}
        />

        <dl className="mt-5 divide-y divide-line/60 border-t border-line/60">
          <MetaRow label="Hemisphere" value={region.hemisphere} />
          <MetaRow label="Structure" value={region.structure_type} />
          <MetaRow label="Atlas" value={region.atlas_source} />
          <MetaRow
            label="Centroid (MNI)"
            value={`${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`}
          />
        </dl>

        <p className="mt-5 text-[11px] leading-relaxed text-ink-faint">
          Coordinates are the centroid of this region in the atlas mesh, not a
          measurement from any patient scan.
        </p>
      </div>
    </div>
  );
}
