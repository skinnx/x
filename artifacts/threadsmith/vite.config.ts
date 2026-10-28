import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = `http://127.0.0.1:${process.env.PORT ?? 3000}`;

export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      ["/api", "/mcp", "/media", "/openapi.json", "/docs", "/llms.txt", "/llms-full.txt"].map((p) => [p, { target: api, changeOrigin: true }]),
    ),
  },
});
