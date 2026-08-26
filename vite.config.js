import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const apiProxy = {
  "/api": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
    secure: false,
  },
  "/media": {
    target: "http://127.0.0.1:8000",
    changeOrigin: true,
    secure: false,
  },
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("react-router")) return "router";
          if (id.includes("react-dom") || id.includes("react/")) return "react";
          return "vendor";
        },
      },
    },
  },
  server: {
    port: 5175,
    strictPort: false,
    proxy: apiProxy,
  },
  preview: {
    port: 5175,
    proxy: apiProxy,
  },
});
