import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" makes the built asset URLs relative, which matters when the
// app is embedded via iframe from an arbitrary host path (e.g. Google Sites).
export default defineConfig({
  plugins: [react()],
  base: "./",
});
