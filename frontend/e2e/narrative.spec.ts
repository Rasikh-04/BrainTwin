import { expect, test, type Page } from "@playwright/test";

/**
 * Coverage for the two-step narrative surfaces: the first-run orientation
 * dialog and the region -> evidence bridge. These guard the connective tissue
 * of the POC — that a reviewer is oriented once, can re-open the honesty legend
 * anytime, and can move from a region into the disorder evidence.
 */

const INTRO_SEEN = () =>
  localStorage.setItem("braintwin.intro.seen", "1");

async function openAtlasSeen(page: Page) {
  await page.addInitScript(INTRO_SEEN);
  await page.goto("/", { waitUntil: "networkidle" });
  await expect(page.getByText("100 of 100 regions")).toBeVisible();
}

test("orientation dialog auto-opens once, persists dismissal, and re-opens", async ({
  page,
}) => {
  // Fresh context: no "seen" flag, so the dialog auto-opens on first visit.
  await page.goto("/", { waitUntil: "networkidle" });

  const dialog = page.getByRole("dialog", { name: "About this demo" });
  await expect(dialog).toBeVisible();
  // It carries the honesty legend, not just a welcome — the four reserved hues
  // are how a reviewer reads the evidence.
  await expect(dialog.getByText("How to read the evidence")).toBeVisible();
  await expect(dialog.getByText("typical / cited")).toBeVisible();

  await dialog.getByRole("button", { name: "Start exploring" }).click();
  await expect(dialog).toHaveCount(0);

  // The dismissal survives a reload — it must not nag on every visit.
  await page.reload({ waitUntil: "networkidle" });
  await expect(
    page.getByRole("dialog", { name: "About this demo" }),
  ).toHaveCount(0);

  // Still reachable on demand from the app-bar (exact, so it does not match the
  // dialog's own "Close about this demo" controls).
  await page
    .getByRole("button", { name: "About this demo", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "About this demo" }),
  ).toBeVisible();

  // Esc closes it.
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "About this demo" }),
  ).toHaveCount(0);
});

test("the app-bar evidence entry names how many studies are wired", async ({
  page,
}) => {
  await openAtlasSeen(page);

  // Two disorders (glioma, epilepsy) have wired cases, so the entry is a
  // self-explaining call-to-action rather than a bare label.
  const entry = page.getByRole("button", { name: /Evidence/ });
  await expect(entry).toContainText("2 studies");
});

test("a region with no cited pattern still bridges into the disorder studies", async ({
  page,
}) => {
  await openAtlasSeen(page);

  await page.getByRole("button", { name: /Left precentral/ }).first().click();

  const panel = page.getByRole("complementary", { name: "Region detail" });
  // No typical-pattern citation references this region yet, so the honest empty
  // state stands — but it still offers a working way into step 2.
  const bridge = panel.getByRole("button", { name: /Browse disorder studies/ });
  await expect(bridge).toBeVisible();

  await bridge.click();
  await expect(page.getByRole("navigation", { name: "Studies" })).toBeVisible();
});
