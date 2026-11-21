import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // tsconfig usa jsx "preserve" (lo transforma Next); en los tests de componentes lo transforma esbuild.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 120_000,
    // Los tests de integración comparten una única BD (presupuesto global): archivos en serie.
    fileParallelism: false,
    projects: [
      { extends: true, test: { name: "unit", include: ["tests/unit/**/*.test.{ts,tsx}"] } },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          globalSetup: ["tests/integration/global-setup.ts"],
        },
      },
    ],
  },
});
