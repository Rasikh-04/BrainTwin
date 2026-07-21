/**
 * TypeScript mirror of the shapes in docs/DATA_CONTRACT.md.
 *
 * These types are the frontend half of a shared contract. Changing a shape here
 * without a corresponding `contract/*` PR reviewed by both developers is a
 * contract violation, not a refactor.
 */

/** The literal marker used wherever cited content does not exist yet. */
export const NEEDS_SOURCE = "NEEDS_SOURCE" as const;

/**
 * A string that is either real cited content or the NEEDS_SOURCE marker.
 * Never render one of these directly; pass it through `resolveSourced`.
 */
export type SourcedText = string;

export type Hemisphere = "left" | "right" | "midline";
export type StructureType = "cortical" | "subcortical";
export type AtlasSource = "desikan-killiany" | "aseg" | "aal";
export type ReviewStatus = "pending" | "reviewed";

export type DisorderCategory = "structural" | "functional" | "neurodegenerative";

/**
 * The only switch the frontend uses to choose a step-2 view. Adding a disorder
 * must never add a code branch — it maps onto one of these three renderers.
 */
export type EvidenceRenderer = "lesion-overlay" | "atrophy-pair" | "eeg";

export type MappingRole = "primary" | "secondary";
export type EvidenceType = "segmentation_mask" | "atrophy" | "eeg";

export interface Region {
  region_id: string;
  name: string;
  atlas_source: AtlasSource;
  hemisphere: Hemisphere;
  structure_type: StructureType;
  centroid_mni: [number, number, number];
  normal_function_description: SourcedText;
  description_source: string | null;
  review_status: ReviewStatus;
}

export interface TypicalAffectedRegion {
  region_id: string;
  /** Citation, e.g. "PMID:12345678". Required — a pattern without one is invalid. */
  source: string;
  note: string;
}

export interface Disorder {
  disorder_id: string;
  name: string;
  category: DisorderCategory;
  evidence_renderer: EvidenceRenderer;
  case_ids: string[];
  description: SourcedText;
  description_source: string | null;
  typical_affected_regions: TypicalAffectedRegion[];
  review_status: ReviewStatus;
}

export interface OverlapMetric {
  overlap_voxels: number;
  overlap_fraction_of_region: number;
}

/**
 * Why a region is highlighted. `overlap_metric` present means the involvement
 * was computed from this patient's mask; absent means it is a literature-level
 * pattern and `provenance` carries the citation. The UI must distinguish these.
 */
export interface RegionMapping {
  region_id: string;
  role: MappingRole;
  evidence_type: EvidenceType;
  overlap_metric: OverlapMetric | null;
  provenance: string;
  notes: string;
}

export interface LesionOverlayEvidence {
  renderer: "lesion-overlay";
  base: string;
  mask: string;
  /** Voxel value -> human label, e.g. { "1": "necrotic core" }. */
  mask_labels: Record<string, string>;
}

export interface AtrophyPairEvidence {
  renderer: "atrophy-pair";
  baseline: string;
  followup: string;
}

export interface EegEvidence {
  renderer: "eeg";
  spectrogram: string;
  waveform: string;
  onset_seconds: number;
  duration_seconds: number;
  involved_channels: string[];
}

export type Evidence = LesionOverlayEvidence | AtrophyPairEvidence | EegEvidence;

export interface AnonymizedMeta {
  age_band?: string;
  sex?: string;
}

export interface Case {
  case_id: string;
  disorder_id: string;
  source_dataset: string;
  anonymized_meta: AnonymizedMeta;
  report_summary: SourcedText;
  evidence: Evidence;
  region_mappings: RegionMapping[];
  review_status: ReviewStatus;
}

/**
 * The waveform JSON emitted alongside an EEG case's spectrogram.
 *
 * TODO(contract): docs/DATA_CONTRACT.md names the file path but never specifies
 * this shape. Typed here from the emitted file (backend/build_dataset.py). Needs
 * a `contract/*` PR to become an agreed shape rather than an observed one.
 */
export interface WaveformChannel {
  name: string;
  values: number[];
}

export interface Waveform {
  sampling_rate_hz: number;
  window: { start_s: number; end_s: number };
  onset_s: number;
  duration_s: number;
  units: string;
  involved_channels: string[];
  channels: WaveformChannel[];
}
