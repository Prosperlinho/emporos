import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  root: "web",
  build: {
    outDir: "../site",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        landing: fileURLToPath(new URL("./web/index.html", import.meta.url)),
        app: fileURLToPath(new URL("./web/app/index.html", import.meta.url)),
      },
    },
  },
});
