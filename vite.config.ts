import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@engine": resolve(__dirname, "src/engine"),
      "@ui": resolve(__dirname, "src/ui"),
      "@store": resolve(__dirname, "src/store"),
    },
  },
});
