import { defineConfig } from "vitest/config";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    globals: true,
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src/engine"),
    },
  },
});
