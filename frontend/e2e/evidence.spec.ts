import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke coverage for step 2, the evidence viewer.
 *
 * These guard the wiring that the type system cannot: that the atlas hands off
 * to the evidence view, that the renderer is chosen from `evidence_renderer`
 * (not the disorder), and that the two medical-honesty rules for step 2 hold —
 * an uncomputed mapping says so, and EEG is framed as scalp-level, never a
 * confident brain focus.
 */
// Suppress the first-run orientation dialog; its behaviour is covered in
// narrative.spec.ts. Without this it would overlay the app-bar handoff button.
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    localStorage.setItem("braintwin.intro.seen", "1"),
  );
});

async function openAtlas(page: Page) {
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByText("100 of 100 regions")).toBeVisible();
}

async function enterEvidence(page: Page) {
  await page.getByRole("button", { name: /Evidence/ }).click();
  await expect(page.getByRole("navigation", { name: "Studies" })).toBeVisible();
}

test("hands off from the atlas to the evidence viewer and back", async ({
  page,
}) => {
  await openAtlas(page);
  await enterEvidence(page);

  // The app-bar now identifies step 2, and a return path exists.
  await expect(page.getByText("Evidence viewer · de-identified case")).toBeVisible();

  await page.getByRole("button", { name: /Atlas/ }).click();
  // Back in the atlas: the region catalog is on screen again.
  await expect(page.getByText("100 of 100 regions")).toBeVisible();
});

test("tumour case shows the lesion legend and an honest uncomputed mapping", async ({
  page,
}) => {
  await openAtlas(page);
  await enterEvidence(page);

  // Entering step 2 defaults to the first disorder with a wired case: glioma.
  await expect(
    page.getByRole("button", { name: /Glioma/ }),
  ).toHaveAttribute("aria-pressed", "true");

  // The mask legend comes from the case's mask_labels, verbatim.
  await expect(page.getByText("necrotic core")).toBeVisible();
  await expect(page.getByText("enhancing tumor")).toBeVisible();

  // brats-001 has no region_mappings yet: this must read as "not computed",
  // never as a finding of no involvement, and never as an invented region.
  await expect(
    page.getByText("Region involvement not yet computed"),
  ).toBeVisible();

  // Unsourced report prose renders as the placeholder, never the raw marker.
  await expect(page.locator("body")).not.toContainText("NEEDS_SOURCE");
});

test("epilepsy case renders EEG evidence as scalp-level, with no brain focus", async ({
  page,
}) => {
  await openAtlas(page);
  await enterEvidence(page);

  await page.getByRole("button", { name: /Epilepsy/ }).click();

  // The renderer switched to EEG purely from the data, not a disorder branch.
  await expect(
    page.getByRole("heading", { name: "Spectrogram" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Channel traces" }),
  ).toBeVisible();
  await expect(page.getByText(/involved:.*F7-T7/)).toBeVisible();

  // The single mapping is a cited, scalp-level association — labelled as such,
  // and the view states plainly that nothing is drawn on the brain as a focus.
  await expect(page.getByText("Left superiortemporal")).toBeVisible();
  await expect(page.getByText("typical / cited")).toBeVisible();
  await expect(
    page.getByText(/Scalp EEG is a surface measurement/),
  ).toBeVisible();
});
