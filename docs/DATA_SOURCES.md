# Data sources and how to get them

All datasets here are public, but "public" ranges from one-line download to a signed agreement plus an email invite that can take days. Access lead time is the critical path for a three-day build, so start every gated registration on hour zero, before writing a line of code. The confirmed-fast datasets (CHB-MIT, and a Kaggle mirror of BraTS) are what you build the first renderers against while the gated ones clear.

Do not attempt to bypass any access control. Where a dataset needs a Data Use Agreement, sign it. Where it needs registration, register.

## Access lead-time summary

| Dataset | Disorder | Access | Realistic wait | Fits day 1? |
|---|---|---|---|---|
| CHB-MIT scalp EEG (PhysioNet) | epilepsy | open, direct download | none | yes |
| BraTS (Kaggle mirror) | tumor | Kaggle account | minutes | yes |
| BraTS (official, Synapse) | tumor | Synapse registration | short | yes, for external showing |
| ATLAS v2.0 stroke | stroke | registration (NITRC / ICPSR) | short to a day | likely |
| OASIS-1 or OASIS-2 | Alzheimer's | Data Use Agreement | up to a week for invite | at risk |
| OASIS-3 | Alzheimer's | DUA plus XNAT invite | up to a week | no, treat as stretch |

Practical reading of this table: build epilepsy and tumor first because they are certain. Slot stroke in as soon as its registration clears (it reuses the tumor renderer, so it is cheap once data is in hand). Treat Alzheimer's as the pillar most likely to be delivered after neurologist review rather than before it, because of the DUA invite delay. The architecture makes any disorder a drop-in via its contract fixture, so the demo is never blocked on a single dataset.

## Tumor: BraTS

What it gives you: multi-parametric MRI (T1, T1ce, T2, FLAIR) with expert voxel-level tumor sub-region masks (labels for necrotic core, peritumoral edema, enhancing tumor). You render the mask that is already there. You do not build tumor segmentation.

Two access paths:

- Fast path for internal build: a Kaggle mirror of a BraTS release (2020 or 2021 are common and well documented). A Kaggle account downloads it in minutes. Use this to build and test the lesion-overlay renderer immediately. Verify the mirror's stated terms before using its files in anything shown externally.
- Path of record for anything external: the official challenge data on Synapse (BraTS 2024 is Synapse ID syn53708249; BraTS Lighthouse 2025 is syn64153130). Register on Synapse, accept terms, and download with the Synapse client. Prefer this source for the demo shown to reviewers so provenance is clean.

For the POC take five to ten cases, not the whole set.

## Stroke: ATLAS v2.0

What it gives you: T1-weighted MRIs with manually segmented lesion masks (one mask file per subject covering all lesions), 655 public training cases. Critically, ATLAS provides a version normalized to MNI-152 standard space, which means a lesion mask can be intersected directly with a standard atlas to compute which regions it touches. That is the whole ballgame for grounded region mapping, and it is why stroke beats Parkinson's for this POC.

Access: registration through the ENIGMA Stroke Recovery / NITRC route (fcon_1000.projects.nitrc.org/indi/retro/atlas.html) or via ICPSR. Grab the R2.0 public training split. Use the normalized (MNI) form so region overlap is trivial. The PALS tool from the ATLAS authors computes lesion overlap with regions of interest if you want a cross-check on your own overlap computation.

Stroke reuses the tumor renderer exactly: a base scan plus a mask overlay in Niivue, and region involvement computed from mask intersect atlas. Once the data is in hand, adding stroke is mostly a preprocessing and fixtures task, not new frontend work.

## Epilepsy: CHB-MIT scalp EEG

What it gives you: 664 EDF files across 23 cases (22 pediatric subjects), 256 Hz, 10-20 montage, with seizure onset and offset annotated. The `RECORDS-WITH-SEIZURES` file lists the 129 files that contain seizures, and each `chbNN-summary.txt` gives the elapsed seconds to seizure start and end. This is fully open on PhysioNet, no application.

Access: direct download from PhysioNet, `physionet.org/content/chbmit/1.0.0/`. A BIDS-EEG converted copy also exists on Zenodo (record 10259996) if you prefer BIDS structure.

Important honesty for the mapping: this is scalp EEG, not intracranial. It tells you seizure timing and which scalp channels are involved, not a precise brain-region focus. The POC shows the EEG evidence (a waveform and spectrogram window around onset) and the involved channels mapped to approximate scalp or cortical territory, labeled as such. Do not claim an exact seizure-focus brain region from scalp EEG. See the scalp EEG caveat in `docs/MEDICAL_ACCURACY.md`.

## Alzheimer's: OASIS

What it gives you: structural MRI with clinical dementia rating (CDR), so you can show atrophy differences (ventricular enlargement, hippocampal and medial temporal atrophy) between a CDR 0 scan and a CDR 1 or 2 scan.

Access reality check, correcting the blueprint: every OASIS release requires agreeing to a Data Use Agreement. There is no OASIS release that is agreement-free. For a three-day window:

- OASIS-1 (cross-sectional, 416 subjects, includes CDR labels and some AD cases) and OASIS-2 (longitudinal, includes nondemented to demented progression) are the lighter-weight options and better for a POC than OASIS-3. OASIS-2 fits the "progression" story best; OASIS-1 fits a cross-sectional CDR 0 versus CDR 1 comparison.
- OASIS-3 is richer and ships FreeSurfer outputs, but access is DUA plus an XNAT invite that can take up to a week. Do not put OASIS-3 on the critical path for the three days.
- `nilearn.datasets.fetch_oasis_vbm` can pull an OASIS-1 cross-sectional subset programmatically and still requires you to have agreed to the DUA. This is the fastest programmatic route if the DUA is accepted.

Start the OASIS DUA on hour zero. If the invite does not arrive within the window, Alzheimer's becomes the post-review addition and stroke plus tumor carry the structural and neuro story for the demo.

For the atrophy region mapping: unlike tumor and stroke, OASIS does not hand you a per-voxel "atrophy mask" of affected regions. The affected-region set for AD (hippocampus, entorhinal cortex, medial temporal lobe) is a literature-level pattern confirmed per case by the CDR rating and the visible atrophy, not a segmented mask. Label it that way in the contract (`evidence_type: "atrophy"`, with a citation), not as a segmentation. If you want per-region volumes, that needs FreeSurfer, which OASIS-3 already ships but OASIS-1 and OASIS-2 do not; running FreeSurfer inside three days is not realistic, so keep AD at the pattern-plus-visible-atrophy level for the POC.

## Atlas meshes for the clickable brain (step 1)

Two routes, both viable. This is Tabeen's preprocessing output and Mannan's step-1 input.

- Primary route (single mesh plus vertex labels): fsaverage ships with FreeSurfer as a `pial` surface plus an `aparc.annot` parcellation, which is one mesh with a per-vertex Desikan-Killiany region label and a color table. Export it as a glb where each region is a named node or primitive (node name equals `region_id`). Use fsaverage6 or fsaverage5 resolution (about 40k or 10k vertices per hemisphere) for web performance. Subcortical structures come from the aseg segmentation as separate small named meshes. fsaverage requires a free FreeSurfer registration.
- Accelerator or fallback (pre-partitioned meshes): Brainder publishes ready-made 3D brain meshes already split into separate files per region for Desikan-Killiany, Destrieux, and DKT, plus subcortical structures, in Wavefront OBJ and PLY, under a Creative Commons license (brainder.org, "Surface models"). Convert OBJ to glb and merge into the two named-node glbs the contract expects. This removes the need to run FreeSurfer just to get the atlas meshes. Verify the current license terms on the page before shipping.

Either way the frontend receives exactly what the mesh contract in `docs/DATA_CONTRACT.md` specifies: `brain-cortical.glb` and `brain-subcortical.glb` with node names equal to `region_id`.

## Region descriptions (the "normal function" text)

This content is curated and cited from established neuroanatomy references, not generated. It is filled as `NEEDS_SOURCE` placeholders in the contract and completed with citations, then reviewed by a neurologist. Do not let Claude Code free-write region function text. See `docs/MEDICAL_ACCURACY.md`.

## A licensing footgun to avoid

These datasets are de-identified, but their Data Use Agreements often restrict redistribution. Publishing patient scans on a public bucket or a public Vercel deployment can breach those terms even though the data is de-identified. For the POC, keep imaging assets local, or behind authentication, or run the demo locally for the neurologist review. Do not push raw dataset files to a public URL without checking that dataset's redistribution terms. This is noted again in `docs/ARCHITECTURE.md` under deployment.
