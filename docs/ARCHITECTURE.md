# Architecture

## Shape of the system

A Next.js app with two distinct visual layers and a set of precomputed static assets behind them. There is no live backend at runtime for the POC; the Python side runs offline and produces files.

- Step 1, the atlas explorer, is React Three Fiber (Three.js). It loads the two atlas glbs, lets the user rotate and click regions, and shows a side panel with the region's name, normal function, and atlas source.
- Step 2, the evidence viewer, is Niivue. It loads the case's NIfTI base plus mask overlay, or the atrophy scan pair, or shows the EEG spectrogram and waveform. Niivue does not use Three.js; it is its own WebGL2 viewer.
- The content (regions, disorders, cases) is static JSON served from `/public/data`. The imaging and EEG assets are static files served from `/public/assets`.
- The Python preprocessing side (offline) produces all of the above: the atlas glbs, the case NIfTI and masks, the computed region mappings, the EEG windows and spectrograms, and the contract JSON.

The two visual layers are deliberately separate components. Only one runs at a time.

## Two rendering contexts, one at a time

Three.js and Niivue each hold their own WebGL2 context. Running both at once is the fastest way to make a laptop fan spin and a phone stutter. So:

- The R3F atlas canvas and the Niivue canvas never render simultaneously. Entering step 2 pauses or unmounts the R3F canvas; returning to step 1 tears down or hides the Niivue canvas.
- Niivue is code-split and lazy-loaded, imported only when the user enters an evidence view, because it is heavy.

## Performance rules (the "no lag" requirement)

The only runtime work is rendering, so rendering must stay cheap.

- Atlas mesh: fsaverage6 resolution or lower (about 40k vertices per hemisphere or less). Draco-compress the glb. Do not ship a full-resolution 160k-vertex-per-hemisphere mesh to the browser.
- Region highlighting: swap the material on the picked node. Do not rebuild or re-upload geometry, and do not recolor per vertex on the CPU each frame. One draw call per region node, material swap on pick.
- Grouping (when multiple regions are involved): use a shared material or an emissive tint on the group, plus an optional outline. Keep it to material and uniform changes, not geometry changes.
- NIfTI: serve compressed `.nii.gz`. Pick small case subsets. If a volume is large, crop to the region of interest offline. Niivue streams and renders these fine at reasonable sizes.
- EEG: never ship raw EDF to the browser and compute the spectrogram client-side. The backend precomputes a spectrogram PNG and a downsampled waveform JSON for the window around onset. The frontend just displays them.
- Load progressively. Show the atlas as soon as it is ready; fetch case JSON and assets on demand when a disorder or case is selected. Do not block first paint on loading every case.

## The two-step UX, concretely

Step 1, atlas mode (baseline). Rotatable 3D brain from the DK plus aseg meshes. Click a region, it highlights, the side panel shows normal name, function, and atlas source. This has to feel accurate and polished on its own before any disorder is layered on. This is the frontend-design skill's moment; spend the polish here.

Step 2, disorder or case mode. Select a disorder, then optionally a specific de-identified case. The same brain re-renders with affected regions highlighted, color-coded by role (primary versus secondary), grouped when several are involved but still individually clickable. Clicking a region shows what is different from normal, the disorder-specific description, and a link to the actual evidence: the Niivue view of the real tumor or stroke mask over the scan, or the atrophy scan pair, or the EEG window around onset. That evidence link is the centerpiece; it is what separates this from a generic 3D brain viewer.

## Production target (documented now so nothing is thrown away)

The static JSON shapes map one to one onto a relational schema. For production this becomes Postgres (Supabase fits, and Tabeen already runs it elsewhere):

```
Region(id, name, atlas_source, hemisphere, structure_type, normal_function_description, description_source, mesh_ref, review_status)
Disorder(id, name, category, evidence_renderer, description, description_source, review_status)
Case(id, disorder_id, source_dataset, anonymized_meta, report_summary, review_status)
CaseRegionMapping(case_id, region_id, role, evidence_type, overlap_metric, provenance, notes)
```

The POC's `regions.json`, `disorders.json`, and `cases/*.json` are exactly these rows serialized. Moving to Postgres later is a load step, not a redesign.

What else changes for production, so it is not forgotten: real-time segmentation with ML models instead of precomputed masks, DICOM ingestion from live clinical sources, real patient data handling where HIPAA and GDPR compliance become mandatory rather than optional, a simulation engine for treatment testing, and a desktop or mobile decision (likely Electron or Tauri wrapping the same web core, or native). None of this blocks the POC. The data model above is built so it survives the transition.

## Deployment and a licensing caution

For the neurologist review, the simplest path is running the app locally or on an access-controlled URL. Be careful before deploying imaging assets to a public URL: the datasets are de-identified but their Data Use Agreements often restrict redistribution, so a public bucket or public Vercel deployment of raw scans can breach terms. Keep imaging assets local or behind auth for the POC unless you have confirmed the specific dataset allows public redistribution. Frontend code and the atlas meshes (CC-licensed) are fine to deploy; the patient-derived NIfTI files are the sensitive part.
