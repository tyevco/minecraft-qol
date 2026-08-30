import { defineConfig } from "vitest/config";

// Only scripts/core is unit-tested: it is the pure layer with no @minecraft
// imports, so it runs in plain Node at full speed with no game and no mocks.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
