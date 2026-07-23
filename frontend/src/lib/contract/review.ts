/**
 * Single choke point for the medical-honesty rules in docs/MEDICAL_ACCURACY.md.
 *
 * Components must not test for the NEEDS_SOURCE string themselves. They call
 * `resolveSourced` and render the result, so the "never blank, never invented"
 * rule is enforced in one place instead of re-implemented per component.
 */

import {
  NEEDS_SOURCE,
  type Case,
  type Disorder,
  type Region,
  type RegionMapping,
  type SourcedText,
} from "./types";

export const PENDING_PLACEHOLDER =
  "Awaiting expert sign-off — no cited source yet.";

export type SourcedResult =
  | { status: "sourced"; text: string; citation: string | null }
  | { status: "pending"; text: typeof PENDING_PLACEHOLDER; citation: null };

/**
 * Turn a possibly-unsourced contract string into something safe to render.
 * An empty or whitespace-only value is treated as pending too: a blank field is
 * just as misleading as an invented one.
 */
export function resolveSourced(
  value: SourcedText | null | undefined,
  citation: string | null = null,
): SourcedResult {
  if (value == null || value.trim() === "" || value === NEEDS_SOURCE) {
    return { status: "pending", text: PENDING_PLACEHOLDER, citation: null };
  }
  return { status: "sourced", text: value, citation };
}

export function isPending(value: SourcedText | null | undefined): boolean {
  return resolveSourced(value).status === "pending";
}

/**
 * How strongly a highlighted region is grounded. The UI must style these
 * differently: `computed` came from this patient's mask, `cited` is a
 * literature-level typical pattern that was never segmented from this patient.
 */
export type EvidenceStrength = "computed" | "cited";

export function evidenceStrength(mapping: RegionMapping): EvidenceStrength {
  return mapping.overlap_metric != null ? "computed" : "cited";
}

/**
 * True while anything on screen is still awaiting sign-off. Drives the
 * persistent banner required by the root CLAUDE.md.
 */
export function hasUnreviewedContent(
  records: Array<Region | Disorder | Case>,
): boolean {
  return records.some((r) => r.review_status !== "reviewed");
}

/** Format an overlap fraction for display, e.g. 0.19 -> "19%". */
export function formatOverlapFraction(fraction: number): string {
  return `${(fraction * 100).toFixed(fraction < 0.01 ? 2 : 0)}%`;
}
