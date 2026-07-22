import { describe, expect, it } from "vitest";

import {
  PENDING_PLACEHOLDER,
  evidenceStrength,
  formatOverlapFraction,
  hasUnreviewedContent,
  isPending,
  resolveSourced,
} from "./review";
import { NEEDS_SOURCE, type Region, type RegionMapping } from "./types";

/**
 * These tests pin the medical-honesty rules in one place. If any assertion here
 * fails, the "never blank, never invented, computed vs cited never blur" contract
 * from docs/MEDICAL_ACCURACY.md is at risk — the UI reads through this module so
 * it does not re-implement those rules per component.
 */

describe("resolveSourced", () => {
  it("passes through real cited content and keeps its citation", () => {
    const result = resolveSourced("Motor control of the contralateral body.", "PMID:123");

    expect(result).toEqual({
      status: "sourced",
      text: "Motor control of the contralateral body.",
      citation: "PMID:123",
    });
  });

  it("defaults the citation to null when none is supplied", () => {
    const result = resolveSourced("Some sourced description.");

    expect(result.status).toBe("sourced");
    expect(result.citation).toBeNull();
  });

  it("treats the NEEDS_SOURCE marker as pending and drops any citation", () => {
    const result = resolveSourced(NEEDS_SOURCE, "PMID:999");

    expect(result).toEqual({
      status: "pending",
      text: PENDING_PLACEHOLDER,
      citation: null,
    });
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["whitespace only", "   \n\t "],
  ])("treats %s as pending — a blank field is as misleading as an invented one", (_label, value) => {
    const result = resolveSourced(value);

    expect(result.status).toBe("pending");
    expect(result.text).toBe(PENDING_PLACEHOLDER);
    expect(result.citation).toBeNull();
  });
});

describe("isPending", () => {
  it("is true for missing or placeholder content and false for real content", () => {
    expect(isPending(NEEDS_SOURCE)).toBe(true);
    expect(isPending("")).toBe(true);
    expect(isPending(null)).toBe(true);
    expect(isPending("Real cited text.")).toBe(false);
  });
});

describe("evidenceStrength", () => {
  const base: RegionMapping = {
    region_id: "ctx-lh-precentral",
    role: "primary",
    evidence_type: "segmentation_mask",
    overlap_metric: null,
    provenance: "PMID:123",
    notes: "",
  };

  it("classifies a mapping with an overlap metric as computed (this patient's mask)", () => {
    const mapping: RegionMapping = {
      ...base,
      overlap_metric: { overlap_voxels: 512, overlap_fraction_of_region: 0.19 },
    };

    expect(evidenceStrength(mapping)).toBe("computed");
  });

  it("classifies a mapping without an overlap metric as cited (literature pattern)", () => {
    expect(evidenceStrength(base)).toBe("cited");
  });
});

describe("hasUnreviewedContent", () => {
  const reviewed = { review_status: "reviewed" } as Region;
  const pending = { review_status: "pending" } as Region;

  it("is true when any record is still pending sign-off", () => {
    expect(hasUnreviewedContent([reviewed, pending])).toBe(true);
  });

  it("is false only when every record is reviewed", () => {
    expect(hasUnreviewedContent([reviewed, reviewed])).toBe(false);
  });

  it("is false for an empty set (nothing unreviewed on screen)", () => {
    expect(hasUnreviewedContent([])).toBe(false);
  });
});

describe("formatOverlapFraction", () => {
  it("renders a normal (>= 1%) fraction as a whole percent", () => {
    expect(formatOverlapFraction(0.19)).toBe("19%");
    expect(formatOverlapFraction(1)).toBe("100%");
    expect(formatOverlapFraction(0.01)).toBe("1%");
  });

  it("keeps two decimals below 1% so a tiny overlap does not collapse to 0%", () => {
    expect(formatOverlapFraction(0.0034)).toBe("0.34%");
    // Exact zero falls under the same < 1% branch, so it reads "0.00%" — a
    // value that does not occur for a real (non-empty) region overlap anyway.
    expect(formatOverlapFraction(0)).toBe("0.00%");
  });
});
