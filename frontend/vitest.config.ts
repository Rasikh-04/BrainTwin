import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Unit tests for the pure contract/logic modules under src/lib.
 *
 * These are the medical-honesty choke points (resolveSourced, evidenceStrength,
 * getRegionLinks, the boundary validators in load.ts). They have no DOM and no
 * WebGL, so the environment is plain node — the React/Niivue/R3F surfaces are
 * exercised by the Playwright e2e suite instead (see playwright.config.ts).
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
