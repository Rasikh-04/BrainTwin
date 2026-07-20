# Medical accuracy and anti-hallucination

Neurologists will review this content. A confident wrong statement that reaches them is the one failure this project cannot afford, and it is more damaging than a blank. This doc is the set of rules that keep the content grounded. It applies to every data file, every UI label, and every generated report. Claude Code must follow it without exception.

## The core distinction: two kinds of claims

Every region-to-disorder link in this project is one of two types, and they must be labeled differently and never confused.

1. Per-case, data-derived. The link is computed from an actual file. Example: a BraTS tumor mask or an ATLAS stroke lesion mask, intersected with the atlas in MNI space, yielding the regions the lesion actually touches, with an overlap metric. Provenance is the file plus the computation. These are strong, specific claims and are the centerpiece of the "mapping is real" pitch.

2. Literature-level pattern. The link is a typical pattern established in the literature, not a segmentation of this patient. Example: Alzheimer's early atrophy in the hippocampus and entorhinal cortex, or the scalp channels typically involved in a seizure type. Provenance is a citation. These must be labeled as typical patterns, never presented as this patient's segmented region.

In the contract, type 1 lives in a case's `region_mappings` with `evidence_type` of `segmentation_mask`. Type 2 lives in a disorder's `typical_affected_regions` with a `source`, or in a case mapping with `evidence_type` of `atrophy` or `eeg` plus a citation. The frontend styles or captions them differently so a reviewer can see which is which.

## Provenance is mandatory

No region mapping exists without provenance. For computed mappings, `provenance` states the computation ("computed: mask.nii.gz intersect DK atlas in MNI space") and carries an `overlap_metric`. For literature mappings, `provenance` or `source` carries a citation (a PMID, DOI, or a named reference). A mapping with neither does not go in the file.

## Prose content is cited or it is a placeholder

Region `normal_function_description`, disorder `description`, and case `report_summary` are curated from established references, not written from the model's own knowledge. Until a cited version exists, the field holds the literal string `NEEDS_SOURCE` and its `_source` companion is null. The frontend renders `NEEDS_SOURCE` as a visible "pending expert review" placeholder. It never renders invented text and never renders a blank that looks like a real answer.

Claude Code specifically must not free-write anatomical or clinical prose into data files. If asked to "fill in the descriptions", it fills them with `NEEDS_SOURCE` markers and a `TODO(neuro-review)` note listing what a human needs to source, unless it is transcribing from a reference the user has actually provided, in which case it records that reference in the `_source` field.

## Region involvement never comes from model priors

The model knows, in a general way, where disorders tend to show up. That knowledge is not allowed to decide which regions light up in this app. For tumor and stroke, involvement is computed from the mask. For Alzheimer's and epilepsy, involvement is a cited pattern. The model must not add a region to a mapping because it "knows" that region is usually involved. If a mask overlap did not produce it and no citation supports it, it does not appear.

## No fabricated patient data

Use only the de-identified fields the dataset actually provides (age band, sex, CDR rating, seizure onset time, and so on). Do not invent clinical histories, symptoms, dates, or identifiers. `anonymized_meta` carries only non-identifying bands. If a field is unknown, omit it; do not fill it with a plausible value.

## The scalp EEG caveat (epilepsy)

CHB-MIT is scalp EEG, not intracranial. It gives seizure timing and which scalp channels show the seizure. It does not give a precise brain-region seizure focus. So for epilepsy:

- Show the real evidence: the waveform and spectrogram window around the annotated onset, and the involved channels.
- Map involvement to approximate scalp or cortical territory (the 10-20 electrode positions overlie known cortical areas), and label it explicitly as scalp-channel-level and approximate.
- Do not render a confident single-region "seizure focus" on the brain and imply it was localized from this scalp recording. That is a claim scalp EEG cannot support, and a neurologist will catch it immediately.

## The atrophy caveat (Alzheimer's)

OASIS does not give a per-voxel atrophy mask. The affected-region set for AD is a literature pattern, confirmed for a given case by its CDR rating and the visible atrophy in the scan pair. Present it as: a real scan pair showing visible atrophy (strong, per case) plus a cited typical-region pattern (labeled as literature). Do not present the AD region set as if it were segmented from this patient's scan.

## Review gating

Everything ships with `review_status: "pending"` and the UI shows a persistent "pending expert review" banner. The review status is per record (per region, per disorder, per case), so a neurologist can sign off item by item and the banner reflects what is still outstanding. Do not set anything to `reviewed` from code; only a human review pass does that.

## A quick self-check before writing any medical or anatomical content

- Is this a computed mask overlap, or a cited pattern, or neither? If neither, it is a `NEEDS_SOURCE` placeholder, not a sentence.
- Does every mapping have provenance (a computation or a citation)? If not, it does not go in.
- Am I about to write anatomy or clinical prose from general knowledge? Stop. Placeholder plus `TODO(neuro-review)` instead.
- Am I adding a region because a mask found it, or because I know it is "usually" involved? Only the former is allowed.
- Am I implying scalp EEG localized a precise focus, or that an AD region set was segmented from this patient? Neither is allowed.
