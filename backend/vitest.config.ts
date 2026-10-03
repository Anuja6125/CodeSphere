import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "next/server": path.resolve(__dirname, "./src/shims/next-server.ts"),
    },
  },
});
