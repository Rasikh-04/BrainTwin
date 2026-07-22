import { afterEach, describe, expect, it, vi } from "vitest";

import {
  indexRegions,
  loadCase,
  loadDisorders,
  loadRegions,
  loadWaveform,
} from "./load";
import type { Region } from "./types";

/**
 * These loaders are the frontend's boundary against malformed contract data.
 * A bad file must fail loudly here, not surface as an undefined field deep in a
 * component (docs/DATA_CONTRACT.md). fetch is mocked so the tests assert the
 * validation, not the network.
 */

/** Install a fetch stub that returns `body` as JSON with the given ok/status. */
function stubFetch(body: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  const { ok = true, status = 200, statusText = "OK" } = init;
  const fetchMock = vi.fn(async () => ({
    ok,
    status,
    statusText,
    json: async () => body,
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const validRegion = {
  region_id: "ctx-lh-precentral",
  name: "Left precentral gyrus",
  hemisphere: "left",
  structure_type: "cortical",
  review_status: "pending",
};

describe("loadRegions", () => {
  it("returns the array when every record has the required fields", async () => {
    stubFetch([validRegion]);

    const regions = await loadRegions();

    expect(regions).toHaveLength(1);
    expect(regions[0].region_id).toBe("ctx-lh-precentral");
  });

  it("throws when the payload is not an array", async () => {
    stubFetch({ region_id: "x" });

    await expect(loadRegions()).rejects.toThrow(/expected a JSON array/);
  });

  it("throws, naming the index and the missing field, when a record is incomplete", async () => {
    const { review_status, ...missingReview } = validRegion;
    void review_status;
    stubFetch([validRegion, missingReview]);

    await expect(loadRegions()).rejects.toThrow(/regions\.json\[1\].*review_status/);
  });

  it("surfaces a non-ok HTTP response as a load error", async () => {
    stubFetch([], { ok: false, status: 404, statusText: "Not Found" });

    await expect(loadRegions()).rejects.toThrow(/404 Not Found/);
  });
});

describe("loadDisorders", () => {
  const validDisorder = {
    disorder_id: "glioma",
    name: "Glioma",
    evidence_renderer: "lesion-overlay",
    case_ids: [],
    review_status: "pending",
  };

  it("returns the array when records are well formed", async () => {
    stubFetch([validDisorder]);

    const disorders = await loadDisorders();

    expect(disorders[0].disorder_id).toBe("glioma");
  });

  it("throws when a record is missing the evidence renderer", async () => {
    const { evidence_renderer, ...missing } = validDisorder;
    void evidence_renderer;
    stubFetch([missing]);

    await expect(loadDisorders()).rejects.toThrow(/evidence_renderer/);
  });
});

describe("loadCase", () => {
  it("throws when the case object is missing required keys", async () => {
    stubFetch({ case_id: "glioma-001" });

    await expect(loadCase("glioma-001")).rejects.toThrow(
      /cases\/glioma-001\.json.*missing required field/,
    );
  });

  it("throws when the case payload is not an object", async () => {
    stubFetch("not-an-object");

    await expect(loadCase("glioma-001")).rejects.toThrow(/expected an object/);
  });
});

describe("loadWaveform", () => {
  it("throws when the waveform is missing sampling metadata", async () => {
    stubFetch({ channels: [] });

    await expect(loadWaveform("/data/wave.json")).rejects.toThrow(/sampling_rate_hz/);
  });
});

describe("indexRegions", () => {
  it("indexes regions by region_id for the mesh-node join", () => {
    const regions = [
      { region_id: "a" } as Region,
      { region_id: "b" } as Region,
    ];

    const index = indexRegions(regions);

    expect(index.get("a")).toBe(regions[0]);
    expect(index.size).toBe(2);
  });
});
