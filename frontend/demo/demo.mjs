/**
 * Scripted end-to-end walkthrough of the BrainTwin POC, paced for screen recording.
 *
 * This is NOT a test. It asserts nothing and fails loudly only when a step cannot be
 * reached, because its job is to drive a real browser through the whole demo at human
 * reading speed so a screencast captures the two-step story start to finish:
 *
 *   step 1  explore a normal brain by region
 *   step 2  switch into a disorder's de-identified case and see the evidence
 *
 * Run it via ./record-demo.sh, which builds the app, warms the Chrome profile, and
 * starts the recorder. Running this file directly works too and reuses whatever
 * profile is already on disk.
 *
 * Pacing: every beat is declared in BEATS below in milliseconds, and SPEED scales all
 * of them at once, so the run can be retimed without touching the choreography.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE_URL = process.env.DEMO_URL ?? "http://localhost:3000";
const PROFILE_DIR = process.env.DEMO_PROFILE ?? "/tmp/braintwin-demo-profile";
const SPEED = Number(process.env.DEMO_SPEED ?? "1"); // >1 is faster, <1 slower
const WARMUP = process.env.DEMO_WARMUP === "1";
const WIDTH = Number(process.env.DEMO_WIDTH ?? "1600");
const HEIGHT = Number(process.env.DEMO_HEIGHT ?? "900");
// Playwright records the page itself over CDP, which works on Wayland where x11grab
// does not. Set DEMO_VIDEO=1 for a hands-off capture; leave it off to drive the
// browser while your own screencast records the desktop.
const VIDEO_DIR = process.env.DEMO_VIDEO === "1"
  ? (process.env.DEMO_VIDEO_DIR ?? "demo/recordings")
  : null;

/**
 * Every pause in the piece, in ms at SPEED=1.
 *
 * These sum to ~45 s. Page loads, mesh parsing and the Niivue volume paints add
 * another ~18 s that no beat controls, which lands the whole run near 60 s. If you
 * retime it, measure the result rather than adding the numbers up.
 */
const BEATS = {
  settle: 1000, // after a view swaps, before the next action
  read: 2200, // long enough to read a panel heading and a value
  study: 3000, // hold on an evidence view, on top of its load wait
  orbit: 2500, // camera drag
  theme: 2800, // the one dark-theme showcase
  dialog: 4000, // the orientation dialog explains the method
  preset: 1200, // a camera tween to an anatomical plane
};

const wait = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms / SPEED)));
const beat = (name) => wait(BEATS[name]);

/** Log each step so a failed run says which beat broke, not just "timeout". */
let step = 0;
function say(what) {
  step += 1;
  console.log(`  ${String(step).padStart(2, "0")}. ${what}`);
}

/**
 * Drag across the canvas to orbit the brain.
 *
 * Done as many small mouse moves rather than one jump: OrbitControls integrates
 * pointer deltas, so a single large move reads as a snap on camera, which looks
 * like a glitch on video.
 */
async function orbit(page, { dx = 260, dy = -60, steps = 45 } = {}) {
  const box = await page.locator("canvas").first().boundingBox();
  if (!box) return;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(cx + (dx * i) / steps, cy + (dy * i) / steps);
    await wait(BEATS.orbit / steps);
  }
  await page.mouse.up();
}

/** Wait for a locator, but never hang the whole recording on one missing node. */
async function show(locator, timeout = 30_000) {
  await locator.first().waitFor({ state: "visible", timeout });
  return locator.first();
}

/**
 * One evidence study: select it in the picker and hold while it renders.
 *
 * The renderer is chosen from the case's `evidence_renderer`, so this same three
 * lines serve the lesion overlay, the EEG view and the atrophy pair. That is the
 * generalisation the demo is meant to show, hence one function, not four.
 */
async function study(page, name) {
  say(`evidence: ${name}`);
  await page.getByRole("button", { name: new RegExp(name) }).first().click();

  // Wait for the case to actually paint, not merely for the click to register. The
  // volumes are megabytes and Niivue decodes them on the CPU, so even with a warm HTTP
  // cache a fixed pause can land while "Loading case…" is still on screen. Waiting on
  // the real signal is also what keeps the run's length stable across machines.
  await page
    .getByText("Loading case…")
    .waitFor({ state: "hidden", timeout: 60_000 })
    .catch(() => {});
  await beat("settle");
  await beat("study");
}

async function run() {
  mkdirSync(PROFILE_DIR, { recursive: true });

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: WARMUP,
    // Playwright's capture pads the page to the requested video size, so when we are
    // recording the page the viewport must BE that size or the result is letterboxed.
    // When the desktop recorder is doing the capture we want the opposite: no fixed
    // viewport, so the page fills whatever window the user sees.
    viewport: VIDEO_DIR && !WARMUP ? { width: WIDTH, height: HEIGHT } : null,
    ...(VIDEO_DIR && !WARMUP
      ? { recordVideo: { dir: VIDEO_DIR, size: { width: WIDTH, height: HEIGHT } } }
      : {}),
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      "--window-position=0,0",
      // The desktop runs at a fractional display scale (KDE/Wayland). Chromium's
      // screencast surface follows that scale, so without this the captured frames come
      // out smaller than the requested video size and Playwright letterboxes them with
      // grey padding. Pinning the scale makes one CSS pixel one captured pixel.
      "--force-device-scale-factor=1",
      "--hide-crash-restore-bubble",
      "--disable-session-crashed-bubble",
      "--disable-infobars",
      // Deliberately NO swiftshader here. The e2e suite forces software GL for
      // headless CI; a recording wants the real GPU or the atlas judders.
    ],
  });

  const page = context.pages()[0] ?? (await context.newPage());

  // Deterministic starting state: light theme, and the orientation dialog unseen so
  // the run always opens with the method explained. Seeded before any script runs,
  // so the no-FOUC head script reads it on the very first paint.
  await page.addInitScript(() => {
    localStorage.setItem("braintwin-theme", "light");
    localStorage.removeItem("braintwin.intro.seen");
  });

  if (WARMUP) {
    console.log("warming the Chrome profile (headless, no recording)...");
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await show(page.getByText("100 of 100 regions"));
    // Touch every study so the case JSON, the NIfTI volumes, the spectrogram and
    // the lazy Niivue chunk are all in the HTTP cache before the visible run.
    await page.getByRole("button", { name: "Start exploring" }).click();
    await page.getByRole("button", { name: /Evidence/ }).first().click();
    for (const name of ["Glioma", "Ischemic stroke", "Epilepsy", "Alzheimer"]) {
      await page.getByRole("button", { name: new RegExp(name) }).first().click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await wait(1500);
    }
    console.log("warm. profile:", PROFILE_DIR);
    await context.close();
    return;
  }

  console.log(`recording walkthrough against ${BASE_URL}`);
  console.log("(start your screencast now if it is not already running)\n");

  // ---- step 1: the normal brain --------------------------------------------- //
  say("load the atlas explorer");
  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await show(page.locator("canvas"));
  await show(page.getByText("100 of 100 regions"));
  await beat("settle");

  say("orientation dialog: the method and how to read the evidence");
  await show(page.getByRole("dialog", { name: "About this demo" }));
  await beat("dialog");
  await page.getByRole("button", { name: "Start exploring" }).click();
  await beat("settle");

  say("orbit the brain");
  await orbit(page);

  say("pick a cortical region from the atlas");
  await page.getByRole("button", { name: /Left precentral/ }).first().click();
  await show(page.getByRole("complementary", { name: "Region detail" }));
  await beat("read");

  say("anatomical view presets");
  for (const preset of ["Sagittal", "Axial"]) {
    await page.getByRole("button", { name: preset, exact: true }).first().click();
    await beat("preset");
  }
  await page.getByRole("button", { name: "3/4", exact: true }).first().click();
  await beat("settle");

  say("ghost the cortex to reach subcortical structures");
  await page.getByRole("button", { name: "Ghost cortex" }).click();
  await beat("read");

  say("per-region colour mode");
  await page.getByRole("button", { name: "Region colours" }).click();
  await beat("read");
  await page.getByRole("button", { name: "Region colours" }).click();
  await page.getByRole("button", { name: "Ghost cortex" }).click();
  await beat("settle");

  say("dissection: isolate a region, then reset the model");
  const panel = page.getByRole("complementary", { name: "Region detail" });
  await panel.getByRole("button", { name: "Isolate" }).click();
  await beat("read");
  await page.getByRole("button", { name: "Reset model" }).click();
  await beat("settle");

  // ---- the one dark-theme showcase ------------------------------------------ //
  say("show the dark reading-room theme, then return to light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await beat("theme");
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await beat("settle");

  // ---- step 2: the evidence -------------------------------------------------- //
  say("hand off to the evidence viewer");
  await page.getByRole("button", { name: /Evidence/ }).first().click();
  await show(page.getByRole("navigation", { name: "Studies" }));
  await beat("settle");

  // Four disorders, three renderers, one code path. Glioma and stroke are both
  // lesion-overlay but reach the atlas by different routes (BraTS registration vs
  // ATLAS registration), which is the generalisation worth showing.
  await study(page, "Glioma");
  await study(page, "Ischemic stroke");
  await study(page, "Epilepsy");
  await study(page, "Alzheimer");

  // ---- close on the honesty posture ------------------------------------------ //
  say("return to the atlas, ending on the pending-review banner");
  await page.getByRole("button", { name: /Atlas/ }).first().click();
  await show(page.getByText("100 of 100 regions"));
  await beat("read");

  console.log("\nwalkthrough complete. stop the recording.");
  await context.close();
}

run().catch((err) => {
  console.error(`\ndemo failed at step ${step}:`, err.message);
  process.exit(1);
});
