import { expect, test, type Page } from "@playwright/test";

/**
 * Smoke coverage for step 1, the atlas explorer.
 *
 * These tests guard the three things that are easy to break silently and
 * impossible to catch with a type check: the mesh-to-catalog join, the
 * medical-honesty placeholder rule, and the material-swap highlight path.
 */

/** The meshes are several MB and software-rendered in CI; give them room. */
async function openAtlas(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.locator("canvas")).toBeVisible();
  // Region list is populated only after regions.json loads and validates.
  await expect(page.getByText("100 of 100 regions")).toBeVisible();

  return errors;
}

test("loads the atlas with every mesh node joined to the region catalog", async ({
  page,
}) => {
  const errors = await openAtlas(page);

  // BrainLayer logs a "[contract]" error for any glb node with no
  // regions.json entry. A clean console means the join holds both ways.
  expect(errors.filter((e) => e.includes("[contract]"))).toEqual([]);
  expect(errors).toEqual([]);
});

test("shows the pending-review banner and never renders NEEDS_SOURCE raw", async ({
  page,
}) => {
  await openAtlas(page);

  await expect(
    page.getByRole("status").getByText("Pending expert review."),
  ).toBeVisible();

  // The literal contract marker must never reach the screen.
  await expect(page.locator("body")).not.toContainText("NEEDS_SOURCE");
});

test("selecting a region shows its atlas record and a sourced placeholder", async ({
  page,
}) => {
  await openAtlas(page);

  await page.getByRole("button", { name: /Left precentral/ }).first().click();

  // Scoped to the detail panel: the region id also appears in the hover
  // readout, and this assertion is about what the panel reports.
  const panel = page.getByRole("complementary", { name: "Region detail" });

  // Identity comes from the contract, not from a lookup table of our own.
  await expect(panel.getByText("ctx-lh-precentral")).toBeVisible();
  await expect(panel.getByText("desikan-killiany")).toBeVisible();

  // Unsourced prose renders as an explicit placeholder, never blank or invented.
  await expect(
    panel.getByText("Pending expert review — no cited source yet."),
  ).toBeVisible();
});

test("ghost cortex toggles without tearing down the scene", async ({ page }) => {
  const errors = await openAtlas(page);

  const ghost = page.getByRole("button", { name: "Ghost cortex" });
  await expect(ghost).toHaveAttribute("aria-pressed", "false");

  await ghost.click();
  await expect(ghost).toHaveAttribute("aria-pressed", "true");

  // The canvas must survive the material change — a torn-down context here
  // would mean we rebuilt geometry instead of swapping material properties.
  await expect(page.locator("canvas")).toBeVisible();
  expect(errors).toEqual([]);
});
