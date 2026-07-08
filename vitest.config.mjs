import { fileURLToPath } from "node:url";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./cockpit", import.meta.url))
    }
  },
  test: {
    exclude: [...configDefaults.exclude, ".claude/**", "mockups/**"]
  }
});
