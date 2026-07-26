import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@flancommand/config": resolve("packages/config/src/index.ts"),
      "@flancommand/event-schema": resolve("packages/event-schema/src/index.ts"),
      "@flancommand/hermes-adapter": resolve("packages/hermes-adapter/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "probe/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
