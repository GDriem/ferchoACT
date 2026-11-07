import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  AZURE_STORAGE_CONNECTION_STRING: z.string().min(1),
  AZURE_STORAGE_CONTAINER: z.string().min(1).default("facturas"),
  AZURE_DI_ENDPOINT: z.string().optional(),
  AZURE_DI_KEY: z.string().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = schema.parse(process.env);
