"use client";

import { useMemo } from "react";

import { getRegionLinks } from "@/lib/contract/links";
import { useAtlasStore } from "@/store/useAtlasStore";

/**
 * Disorders linked to a region, shown as cited typical patterns only.
 *
 * This is the "articles on disorders linked with the region" surface. It is
 * deliberately conservative: a link appears only when a disorder's
 * `typical_affected_regions` names this region and carries a citation. It never
 * asserts "this patient's region is involved" — that stronger, per-case claim
 * lives in the step-2 evidence view. When no cited pattern references the
 * region, it says so plainly rather than inventing a connection.
 */
export function RegionLinks({ regionId }: { regionId: string }) {
  const disorders = useAtlasStore((s) => s.disorders);
  const links = useMemo(
    () => getRegionLinks(regionId, disorders),
    [regionId, disorders],
  );

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-[10px] font-medium uppercase tracking-[0.13em] text-ink-faint">
          Linked disorders
        </h3>
        <span className="ident text-cited">typical pattern</span>
      </div>

      {links.length === 0 ? (
        <p className="rounded-md border border-dashed border-line bg-surface-0/40 px-2.5 py-2 text-[11.5px] leading-relaxed text-ink-faint">
          No cited disorder pattern references this region yet. Literature-level
          links are added with a citation, and per-case involvement (tumour or
          stroke masks overlapping this region) appears in the disorder demo.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {links.map((link) => (
            <li
              key={`${link.disorderId}-${link.source}`}
              className="rounded-md border border-line bg-surface-0/50 px-2.5 py-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-medium text-ink">
                  {link.disorderName}
                </span>
                {link.hasDemo && (
                  <span className="ident rounded bg-surface-2 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-ink-muted">
                    demo
                  </span>
                )}
              </div>
              {link.note && (
                <p className="mt-1 text-[11.5px] leading-relaxed text-ink-muted">
                  {link.note}
                </p>
              )}
              <p className="ident mt-1 text-cited">Source: {link.source}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
