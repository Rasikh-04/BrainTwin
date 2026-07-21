/**
 * Loaders for the static contract JSON under /public/data.
 *
 * There is no runtime backend in the POC, so these are plain fetches against
 * static files. Cases are fetched on demand (never eagerly for every disorder)
 * to keep first paint of the atlas fast, per docs/ARCHITECTURE.md.
 */

import type { Case, Disorder, Region, Waveform } from "./types";

const DATA_ROOT = "/data";

/**
 * Validation at the boundary: a malformed contract file should fail loudly here
 * rather than surface as an undefined field inside a component.
 */
function assertArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${what}: expected a JSON array, got ${typeof value}`);
  }
  return value;
}

function assertKeys(value: unknown, keys: string[], what: string): void {
  if (typeof value !== "object" || value === null) {
    throw new Error(`${what}: expected an object, got ${typeof value}`);
  }
  const missing = keys.filter((k) => !(k in value));
  if (missing.length > 0) {
    throw new Error(`${what}: missing required field(s): ${missing.join(", ")}`);
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function loadRegions(): Promise<Region[]> {
  const raw = assertArray(
    await fetchJson(`${DATA_ROOT}/regions.json`),
    "regions.json",
  );
  raw.forEach((r, i) =>
    assertKeys(
      r,
      ["region_id", "name", "hemisphere", "structure_type", "review_status"],
      `regions.json[${i}]`,
    ),
  );
  return raw as Region[];
}

export async function loadDisorders(): Promise<Disorder[]> {
  const raw = assertArray(
    await fetchJson(`${DATA_ROOT}/disorders.json`),
    "disorders.json",
  );
  raw.forEach((d, i) =>
    assertKeys(
      d,
      ["disorder_id", "name", "evidence_renderer", "case_ids", "review_status"],
      `disorders.json[${i}]`,
    ),
  );
  return raw as Disorder[];
}

export async function loadCase(caseId: string): Promise<Case> {
  const raw = await fetchJson(`${DATA_ROOT}/cases/${caseId}.json`);
  assertKeys(
    raw,
    ["case_id", "disorder_id", "evidence", "region_mappings", "review_status"],
    `cases/${caseId}.json`,
  );
  return raw as Case;
}

/** EEG waveform, fetched only when an eeg evidence view opens. */
export async function loadWaveform(url: string): Promise<Waveform> {
  const raw = await fetchJson(url);
  assertKeys(raw, ["sampling_rate_hz", "channels"], `waveform ${url}`);
  return raw as Waveform;
}

/** Index regions by `region_id` for the mesh-node join used by the atlas. */
export function indexRegions(regions: Region[]): Map<string, Region> {
  return new Map(regions.map((r) => [r.region_id, r]));
}
