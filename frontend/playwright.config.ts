import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for the atlas explorer.
 *
 * The suite renders real WebGL. CI machines have no GPU, so Chromium is forced
 * onto SwiftShader (software rasterisation). That is correct but slow, which is
 * why the timeouts here are generous compared with a typical DOM-only suite.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "list" : "html",
  timeout: 180_000,
  expect: { timeout: 60_000 },

  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
      ],
    },
  },

  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],

  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
