/**
 * Crea el contenedor privado de facturas y la regla CORS que permite al
 * navegador subir directo a Blob con la SAS. Correr una vez por cuenta de
 * almacenamiento (Azurite en local o la cuenta de Azure).
 *
 *   npm run storage:setup
 */
import { BlobServiceClient } from "@azure/storage-blob";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const connection = process.env.AZURE_STORAGE_CONNECTION_STRING!;
const containerName = process.env.AZURE_STORAGE_CONTAINER || "facturas";
const origins = process.env.APP_URL || "http://localhost:3000";

const service = BlobServiceClient.fromConnectionString(connection);
await service.getContainerClient(containerName).createIfNotExists();
await service.setProperties({
  cors: [
    {
      allowedOrigins: origins,
      allowedMethods: "PUT,GET,HEAD,OPTIONS",
      allowedHeaders: "content-type,x-ms-blob-type,x-ms-version,x-ms-date,x-ms-blob-content-type",
      exposedHeaders: "etag,x-ms-request-id",
      maxAgeInSeconds: 3600,
    },
  ],
});
console.log(`Contenedor "${containerName}" listo; CORS para ${origins}`);
