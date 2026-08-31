import { defineConfig } from "vitest/config";
import path from "path";

// Only pure layers are unit-tested: packages/shared/core and each pack's own
// core/, none of which import @minecraft/*. They run in plain Node at full speed
// with no game and no mocks.
export default defineConfig({
  resolve: {
    alias: {
      "@qol/shared": path.resolve(__dirname, "packages/shared"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/**/tests/**/*.test.ts"],
  },
});
