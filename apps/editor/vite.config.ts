import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { motionPwa } from "./pwa.ts";

export default defineConfig({
  // Set EDITOR_BASE=/app/ when the editor is served under the landing domain.
  base: process.env.EDITOR_BASE ?? "/",
  plugins: [react(), tailwindcss(), motionPwa()],
  server: { port: 5180, strictPort: true },
  preview: { port: 4173 },
  build: { target: "es2022" },
  // Mediabunny ships modern ESM; pre-bundling it only slows dev start.
  optimizeDeps: { exclude: ["mediabunny"] },
});
