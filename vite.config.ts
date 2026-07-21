import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { handleQuoteRequest } from "./server/quote.mjs";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "local-quote-api",
      configureServer(server) {
        server.middlewares.use("/api/quote", handleQuoteRequest);
      },
    },
  ],
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
