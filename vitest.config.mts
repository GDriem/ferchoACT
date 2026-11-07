import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "vitest/config";

// Mismas variables que la app; los tests usan una base aparte (<db>_test)
config({ path: [".env.local", ".env"], quiet: true });
const testDbUrl = process.env.DATABASE_URL?.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2");
// globalSetup corre en este mismo proceso y crea/migra esa base
process.env.DATABASE_URL = testDbUrl;

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // server-only lanza fuera de React Server Components
      "server-only": fileURLToPath(new URL("./test/server-only-stub.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./test/global-setup.ts"],
    env: {
      DATABASE_URL: testDbUrl ?? "",
      // El OCR siempre se prueba con el adaptador mock
      AZURE_DI_ENDPOINT: "",
      AZURE_DI_KEY: "",
    },
    // Los tests de base comparten el mismo Postgres
    fileParallelism: false,
  },
});
