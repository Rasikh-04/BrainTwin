# Downloads quick-start

A plain checklist of what to download, from where, and what file type you get. Read this alongside `docs/DATA_SOURCES.md`. The rule to remember: downloading and building are separate timelines. Kick off the gated registrations, grab the instant ones, and start building against fixtures without waiting for any of it.

## File types you are looking for

- NIfTI (.nii or .nii.gz): a 3D brain scan in one file. What research MRI comes as. Niivue loads it directly. Most of what you need.
- Segmentation mask: also a NIfTI file, same size as the scan, storing a label per voxel (0 nothing, 1 tumor core, and so on). It is the "which voxels are the lesion" file. BraTS and ATLAS ship these, so you never segment anything yourself.
- EDF (.edf): the standard EEG file, a time series per scalp electrode. Not an image. Epilepsy only. Read with MNE-Python.
- glTF / .glb: the web 3D model, the rotatable clickable brain surface. From FreeSurfer or Brainder, converted to .glb.
- OBJ / PLY: other mesh formats (Brainder ships these). Convert to .glb.
- DICOM (.dcm): raw scanner format. You do not need it. Research data is already NIfTI.

## Hour zero: start the gated registrations

These involve someone or something approving on the other end, so start the clock first, then walk away and build.

- OASIS (Alzheimer's, 3D route): agree to the data use terms at sites.wustl.edu/oasisbrains. Use OASIS-1, not OASIS-3, because OASIS-3 adds a manual XNAT invite that can take about a week. OASIS-1 is lighter.
- ATLAS v2.0 (stroke): register at fcon_1000.projects.nitrc.org/indi/retro/atlas.html (or ICPSR study 36684 at icpsr.umich.edu/web/ICPSR/studies/36684). Usually fast.
- BraTS official (tumor, only needed for external showing): register on Synapse for BraTS 2024 (Synapse ID syn53708249). For internal building you do not need this; use the Kaggle mirror below.

## Hour zero: grab the instant ones

- CHB-MIT (epilepsy), fully open, no account: physionet.org/content/chbmit/1.0.0. Download the whole set or mirror it with a recursive fetch of physionet.org/files/chbmit/1.0.0/. You want the EDF files, the .seizure annotation files, and the chbNN-summary.txt files that list seizure onset and offset seconds.
- BraTS 2021 (tumor), free Kaggle account, minutes: kaggle.com/datasets/dschettler8845/brats-2021-task1. NIfTI scans in four modalities plus the segmentation mask. Take five to ten cases for the POC. Mask labels are 1 necrotic core, 2 edema, 4 enhancing tumor.
- Alzheimer's, no sign-off at all, instant: kaggle.com/datasets/ninadaithal/imagesoasis. This is OASIS-1 as 2D JPEG slices. Use this if you want Alzheimer's guaranteed in the demo with zero friction. The trade-off is 2D only, so no 3D Niivue view and no atlas mapping.

## Atlas mesh for the clickable brain

- Brainder surface models: brainder.org, "Surface models". Pre-made per-region brain meshes for Desikan-Killiany plus subcortical structures, in OBJ and PLY, Creative Commons. Convert to the two .glb files the contract expects. This is the fastest route and avoids running FreeSurfer.
- FreeSurfer fsaverage (alternative): surfer.nmr.mgh.harvard.edu, free registration. Export the fsaverage6 pial surface plus aparc.annot to a .glb with named region nodes.

## The Alzheimer's decision, stated plainly

The only thing that ever made Alzheimer's awkward was download timing, not accuracy. The neurologist reviews accuracy for all four disorders equally. So Alzheimer's is a normal pillar in the demo. Two routes:

- Want it instant and are fine with 2D: Kaggle OASIS JPEG mirror. Zero sign-off.
- Want the 3D atrophy view and atlas mapping: OASIS-1 NIfTI. Agree to the OASIS data use terms on hour zero. Lighter and faster than OASIS-3.

Recommended: start OASIS-1 for the nicer view, keep the Kaggle mirror as the guaranteed fallback.

## What is public, in one line each

- CHB-MIT: fully open, no account.
- BraTS Kaggle mirror: public, free Kaggle account.
- ATLAS v2.0: public, free registration.
- OASIS-1 (3D): public, agree to data use terms.
- OASIS Kaggle mirror (2D): public, no sign-off.
- OpenNeuro: fully open, CC0, click-through only. Mostly EEG for Alzheimer's, so not the first pick for the atrophy story, but the most frictionless repository in general.
- Brainder meshes: open, Creative Commons.

## Licensing footgun, still applies

These sets are de-identified but their agreements often restrict redistribution. Do not push raw scan files to a public URL or public deployment without checking that dataset's terms. For the review, run locally or behind auth. Frontend code and the CC-licensed meshes are fine to deploy; the patient-derived NIfTI files are the sensitive part.
