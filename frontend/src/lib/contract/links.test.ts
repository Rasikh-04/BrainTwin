import { describe, expect, it } from "vitest";

import { getRegionLinks } from "./links";
import type { Disorder, TypicalAffectedRegion } from "./types";

/**
 * getRegionLinks is the atlas panel's only source of region -> disorder links.
 * It must only ever surface literature-level typical patterns (each with a
 * citation), never present them as this-patient involvement, and derive the
 * step-2 jump target honestly from the disorder's wired cases.
 */

function pattern(regionId: string, source = "PMID:1", note = "typical"): TypicalAffectedRegion {
  return { region_id: regionId, source, note };
}

function disorder(overrides: Partial<Disorder> = {}): Disorder {
  return {
    disorder_id: "glioma",
    name: "Glioma",
    category: "structural",
    evidence_renderer: "lesion-overlay",
    case_ids: [],
    description: "A tumour.",
    description_source: null,
    typical_affected_regions: [],
    review_status: "pending",
    ...overrides,
  };
}

describe("getRegionLinks", () => {
  it("returns a link for a disorder whose typical pattern names the region", () => {
    const disorders = [
      disorder({
        typical_affected_regions: [pattern("ctx-lh-precentral", "PMID:42", "motor cortex")],
      }),
    ];

    const links = getRegionLinks("ctx-lh-precentral", disorders);

    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({
      disorderId: "glioma",
      disorderName: "Glioma",
      linkType: "typical-pattern",
      source: "PMID:42",
      note: "motor cortex",
    });
  });

  it("returns no links when no disorder names the region", () => {
    const disorders = [
      disorder({ typical_affected_regions: [pattern("ctx-lh-insula")] }),
    ];

    expect(getRegionLinks("ctx-lh-precentral", disorders)).toEqual([]);
  });

  it("collects links across multiple disorders that share the region", () => {
    const disorders = [
      disorder({
        disorder_id: "glioma",
        name: "Glioma",
        typical_affected_regions: [pattern("ctx-lh-precentral")],
      }),
      disorder({
        disorder_id: "stroke",
        name: "Ischemic stroke",
        typical_affected_regions: [pattern("ctx-lh-precentral")],
      }),
    ];

    const links = getRegionLinks("ctx-lh-precentral", disorders);

    expect(links.map((l) => l.disorderId)).toEqual(["glioma", "stroke"]);
  });

  it("marks a disorder with a wired case as demoable and exposes its first case id", () => {
    const disorders = [
      disorder({
        case_ids: ["glioma-001", "glioma-002"],
        typical_affected_regions: [pattern("ctx-lh-precentral")],
      }),
    ];

    const [link] = getRegionLinks("ctx-lh-precentral", disorders);

    expect(link.hasDemo).toBe(true);
    expect(link.caseId).toBe("glioma-001");
  });

  it("marks a disorder with no wired case as non-demoable with a null case id", () => {
    const disorders = [
      disorder({
        case_ids: [],
        typical_affected_regions: [pattern("ctx-lh-precentral")],
      }),
    ];

    const [link] = getRegionLinks("ctx-lh-precentral", disorders);

    expect(link.hasDemo).toBe(false);
    expect(link.caseId).toBeNull();
  });

  it("emits a link per matching pattern when a disorder lists the region twice", () => {
    const disorders = [
      disorder({
        typical_affected_regions: [
          pattern("ctx-lh-precentral", "PMID:1"),
          pattern("ctx-lh-precentral", "PMID:2"),
        ],
      }),
    ];

    expect(getRegionLinks("ctx-lh-precentral", disorders)).toHaveLength(2);
  });
});
