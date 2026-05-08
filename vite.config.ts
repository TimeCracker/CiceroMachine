import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 8000,
    strictPort: false,
    proxy: {
      "/api": "http://127.0.0.1:8787"
    }
  },
  build: {
    target: "es2022",
    rollupOptions: {
      input: {
        debate: "debate.html"
      }
    }
  }
});
