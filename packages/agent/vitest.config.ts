import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/worker.ts",
        "src/run.ts",
        "src/healthcheck.ts",
        "src/lib/env.ts",
        "src/lib/logger.ts",
        "src/lib/types.ts",
        "src/lib/config.ts",
        "src/observability/**",
        "src/workflows/**",
        "src/rag/refreshRepo.ts",
      ],
      thresholds: {
        statements: 100,
        functions: 100,
        lines: 100,
        branches: 98,
      },
    },
  },
});
