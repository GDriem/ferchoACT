import "server-only";
import { BlobSASPermissions, BlobServiceClient } from "@azure/storage-blob";
import { env } from "@/lib/env";

/** Tipos que aceptamos para facturas y su extensión en el blob. */
export const UPLOAD_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
} as const;
export type UploadContentType = keyof typeof UPLOAD_TYPES;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const UPLOAD_SAS_MINUTES = 10;
const READ_SAS_MINUTES = 5;

function container() {
  return BlobServiceClient.fromConnectionString(env.AZURE_STORAGE_CONNECTION_STRING).getContainerClient(
    env.AZURE_STORAGE_CONTAINER,
  );
}

const minutesFromNow = (m: number) => new Date(Date.now() + m * 60 * 1000);

/**
 * Las SAS las abre el navegador. En Docker el servidor llega a Azurite como
 * `azurite:10000`, pero el navegador necesita `localhost:10000`.
 */
function forBrowser(sasUrl: string) {
  if (!env.AZURE_STORAGE_PUBLIC_ENDPOINT) return sasUrl;
  const url = new URL(sasUrl);
  const publicUrl = new URL(env.AZURE_STORAGE_PUBLIC_ENDPOINT);
  url.protocol = publicUrl.protocol;
  url.host = publicUrl.host;
  return url.toString();
}

/** SAS de escritura para un solo blob, válida 10 minutos. */
export async function createUploadUrl(blobName: string) {
  return forBrowser(
    await container()
      .getBlockBlobClient(blobName)
      .generateSasUrl({
        permissions: BlobSASPermissions.parse("cw"),
        expiresOn: minutesFromNow(UPLOAD_SAS_MINUTES),
      }),
  );
}

/**
 * SAS de lectura de corta duración. Llamar solo después de requireCompanyAccess:
 * las facturas son datos fiscales y el contenedor es privado.
 */
export async function createReadUrl(blobName: string) {
  return forBrowser(
    await container()
      .getBlobClient(blobName)
      .generateSasUrl({ permissions: BlobSASPermissions.parse("r"), expiresOn: minutesFromNow(READ_SAS_MINUTES) }),
  );
}

/** Tamaño y tipo del blob subido, o null si no existe. */
export async function getBlobInfo(blobName: string) {
  try {
    const props = await container().getBlobClient(blobName).getProperties();
    return { sizeBytes: props.contentLength ?? 0, contentType: props.contentType ?? "" };
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 404) return null;
    throw e;
  }
}

export async function downloadBlob(blobName: string): Promise<Uint8Array> {
  return container().getBlobClient(blobName).downloadToBuffer();
}

/** Subida desde el servidor (archivos chicos: foto de perfil, logo). */
export async function uploadBlob(blobName: string, data: Uint8Array, contentType: string) {
  await container()
    .getBlockBlobClient(blobName)
    .uploadData(data, { blobHTTPHeaders: { blobContentType: contentType } });
}

export async function deleteBlob(blobName: string) {
  await container().getBlobClient(blobName).deleteIfExists();
}
