import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["tests/*.test.ts"],
    // Live database and browser suites have their own guarded, sequential runners.
    fileParallelism: false,
  },
});
