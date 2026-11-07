import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  AZURE_STORAGE_CONNECTION_STRING: z.string().min(1),
  AZURE_STORAGE_CONTAINER: z.string().min(1).default("facturas"),
  // Host de Blob que ve el navegador si difiere del que usa el servidor (Docker local).
  AZURE_STORAGE_PUBLIC_ENDPOINT: z.url().optional(),
  AZURE_DI_ENDPOINT: z.string().optional(),
  AZURE_DI_KEY: z.string().optional(),
  // Azure Communication Services Email. Si falta, las invitaciones solo muestran el enlace.
  ACS_CONNECTION_STRING: z.string().optional(),
  ACS_EMAIL_SENDER: z.string().optional(),
  // URL pública para los enlaces de invitación. Si falta se usa el host de la petición.
  APP_URL: z.url().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = schema.parse(process.env);
