/**
 * Region -> disorder links, computed honestly from the contract data.
 *
 * The only disorder links a region can claim here are literature-level typical
 * patterns: a disorder whose `typical_affected_regions` names this region, each
 * of which carries a required citation. These are NOT "this patient's segmented
 * region" — per docs/MEDICAL_ACCURACY.md the two claim types must never blur, so
 * a link is always labelled as a cited typical pattern.
 *
 * Per-case computed involvement (a tumour/stroke mask overlapping this region)
 * is a stronger, per-case claim that lives in a case's `region_mappings` and is
 * surfaced in the step-2 evidence view, not asserted from the atlas panel.
 */

import type { Disorder } from "./types";

export interface RegionDisorderLink {
  disorderId: string;
  disorderName: string;
  /** Always "typical-pattern" here — the only link type the atlas panel makes. */
  linkType: "typical-pattern";
  /** Citation for the pattern (PMID / DOI / named reference). Never empty. */
  source: string;
  note: string;
  /** True when the disorder has at least one demo case wired for step 2. */
  hasDemo: boolean;
}

export function getRegionLinks(
  regionId: string,
  disorders: Disorder[],
): RegionDisorderLink[] {
  const links: RegionDisorderLink[] = [];

  for (const disorder of disorders) {
    for (const pattern of disorder.typical_affected_regions) {
      if (pattern.region_id !== regionId) continue;
      links.push({
        disorderId: disorder.disorder_id,
        disorderName: disorder.name,
        linkType: "typical-pattern",
        source: pattern.source,
        note: pattern.note,
        hasDemo: disorder.case_ids.length > 0,
      });
    }
  }

  return links;
}
