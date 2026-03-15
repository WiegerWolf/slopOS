import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8787"
    },
    watch: {
      // Only ignore node_modules; generated/ must be watched so Vite's
      // transform pipeline picks up dynamically-written surface modules.
      ignored: ['**/node_modules/**']
    }
  },
  resolve: {
    alias: {
      "@slopos/host": resolve(__dirname, "../../packages/pilot-host/src/index.ts"),
      "@slopos/runtime": resolve(__dirname, "../../packages/pilot-runtime/src/index.ts"),
      "@slopos/ui": resolve(__dirname, "../../packages/pilot-ui/src/index.tsx")
    }
  }
});
