import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.ts"],
    mockReset: true,
    restoreMocks: true,
    coverage: {
      reporter: ["text", "html"],
      exclude: [
        "dist/**",
        "src/**/*.test.ts",
        "src/cli.ts", // CLI entry point is harder to test in unit tests
      ],
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
});
