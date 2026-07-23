"use client";

import { useDeferredValue, useMemo, useState } from "react";

import { useAtlasStore } from "@/store/useAtlasStore";
import type { Region } from "@/lib/contract/types";

/**
 * Searchable list of all atlas regions.
 *
 * 100 regions is too many to find by orbiting and clicking, and subcortical
 * structures are hidden inside the cortex entirely. The index makes every
 * region reachable without hunting, which matters for a reviewer checking a
 * specific structure.
 */
export function RegionIndex() {
  const regions = useAtlasStore((s) => s.regions);
  const selectedRegionId = useAtlasStore((s) => s.selectedRegionId);
  const selectRegion = useAtlasStore((s) => s.selectRegion);
  const hoverRegion = useAtlasStore((s) => s.hoverRegion);

  const [query, setQuery] = useState("");
  // Keeps typing responsive while filtering the full catalog.
  const deferredQuery = useDeferredValue(query);

  const grouped = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    const matches = needle
      ? regions.filter(
          (r) =>
            r.name.toLowerCase().includes(needle) ||
            r.region_id.toLowerCase().includes(needle),
        )
      : regions;

    const buckets: Record<"cortical" | "subcortical", Region[]> = {
      cortical: [],
      subcortical: [],
    };
    for (const region of matches) buckets[region.structure_type].push(region);
    return buckets;
  }, [regions, deferredQuery]);

  const total = grouped.cortical.length + grouped.subcortical.length;

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line px-3 py-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search regions"
          aria-label="Search atlas regions"
          className="t-body w-full rounded-md border border-line bg-surface-0 px-2.5 py-1.5 text-ink placeholder:text-ink-faint focus:border-select/60 focus:outline-none"
        />
        <p className="ident mt-2">
          {total} of {regions.length} regions
        </p>
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto py-1">
        {total === 0 && (
          <p className="t-body px-3 py-6 text-center text-ink-faint">
            No region matches that search.
          </p>
        )}

        {(["cortical", "subcortical"] as const).map((group) =>
          grouped[group].length === 0 ? null : (
            <section key={group}>
              <h3 className="t-tag sticky top-0 z-10 bg-surface-1/95 px-3 py-1.5 font-medium uppercase tracking-[0.13em] text-ink-faint backdrop-blur">
                {group}
              </h3>
              <ul>
                {grouped[group].map((region) => {
                  const isSelected = region.region_id === selectedRegionId;
                  return (
                    <li key={region.region_id}>
                      <button
                        type="button"
                        onClick={() => selectRegion(region.region_id)}
                        onMouseEnter={() => hoverRegion(region.region_id)}
                        onMouseLeave={() => hoverRegion(null)}
                        aria-current={isSelected}
                        className={`flex w-full items-baseline gap-2 border-l-2 px-3 py-1.5 text-left transition-colors ${
                          isSelected
                            ? "border-select bg-select/10 text-ink"
                            : "border-transparent text-ink-muted hover:bg-surface-2/60 hover:text-ink"
                        }`}
                      >
                        <span className="t-body truncate">
                          {region.name}
                        </span>
                        <span className="ident ml-auto shrink-0">
                          {region.hemisphere.slice(0, 1).toUpperCase()}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ),
        )}
      </div>
    </div>
  );
}
