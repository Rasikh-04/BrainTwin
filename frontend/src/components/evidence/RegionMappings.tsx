"use client";

import { evidenceStrength, formatOverlapFraction } from "@/lib/contract/review";
import type { RegionMapping } from "@/lib/contract/types";
import { useAtlasStore } from "@/store/useAtlasStore";

/**
 * The involved-regions list for a case — the traceability payload of step 2.
 *
 * Two claim types are styled so a reviewer can never confuse them
 * (docs/MEDICAL_ACCURACY.md):
 *   - computed: an overlap of THIS patient's mask with the atlas, shown with its
 *     overlap metric and the `computed` hue.
 *   - cited: a literature-level typical pattern (or a scalp-level EEG channel
 *     association), shown with its provenance and the `cited` hue, never as a
 *     segmented region of this patient.
 *
 * An empty list is not an error and is not hidden: it means the overlap has not
 * been computed yet (the tumour pipeline is a backend task). We say exactly that
 * rather than implying no region is involved.
 */
export function RegionMappings({ mappings }: { mappings: RegionMapping[] }) {
  const regionsById = useAtlasStore((s) => s.regionsById);

  if (mappings.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-pending/35 bg-pending/[0.06] px-3 py-3">
        <p className="t-body font-medium text-pending/90">
          Region involvement not yet computed
        </p>
        <p className="t-ctl mt-1 leading-relaxed text-pending/80">
          This case&rsquo;s mask has not been overlapped with the atlas yet, so
          no regions are highlighted. This is not a finding of no involvement.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {mappings.map((mapping) => {
        const region = regionsById.get(mapping.region_id);
        const strength = evidenceStrength(mapping);
        const isComputed = strength === "computed";
        const roleColor =
          mapping.role === "primary"
            ? "text-primary-role"
            : "text-secondary-role";

        return (
          <li
            key={mapping.region_id}
            className="rounded-md border border-line bg-surface-0 px-3 py-2.5 transition-colors hover:border-line-strong"
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="t-body font-medium text-ink">
                {region?.name ?? mapping.region_id}
              </p>
              <span className={`ident shrink-0 ${roleColor}`}>
                {mapping.role}
              </span>
            </div>
            <p className="ident mt-0.5 text-ink-faint">{mapping.region_id}</p>

            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span
                className={`t-tag rounded px-1.5 py-0.5 font-medium uppercase tracking-[0.1em] ${
                  isComputed
                    ? "bg-computed/15 text-computed"
                    : "bg-cited/15 text-cited"
                }`}
              >
                {isComputed ? "computed" : "typical / cited"}
              </span>
              {isComputed && mapping.overlap_metric && (
                <span className="ident text-computed">
                  {formatOverlapFraction(
                    mapping.overlap_metric.overlap_fraction_of_region,
                  )}{" "}
                  of region &middot; {mapping.overlap_metric.overlap_voxels} vox
                </span>
              )}
            </div>

            {mapping.provenance && (
              <p className="t-ctl mt-2 leading-relaxed text-ink-muted">
                {mapping.provenance}
              </p>
            )}
            {mapping.notes && (
              <p className="t-fine mt-1 leading-relaxed text-ink-faint">
                {mapping.notes}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
