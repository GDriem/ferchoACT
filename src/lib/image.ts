/** Lado mayor máximo y calidad JPEG para las fotos de facturas. */
const MAX_SIDE = 2000;
const QUALITY = 0.85;

/**
 * Reduce la foto en el navegador antes de subirla (lado mayor ≤ 2000 px,
 * JPEG 0.85). Respeta la orientación EXIF. Lanza si el formato no se puede leer.
 */
export async function compressImage(file: File, { maxSide = MAX_SIDE, quality = QUALITY } = {}): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas no disponible");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("No se pudo comprimir la imagen");
  // Si la original ya era un JPEG más liviano, se sube tal cual
  return file.type === "image/jpeg" && file.size <= blob.size && scale === 1 ? file : blob;
}

/** PUT directo a Blob con la SAS, reportando el progreso real (0-1). */
export function uploadToBlob(url: string, body: Blob, contentType: string, onProgress: (p: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("x-ms-blob-type", "BlockBlob");
    xhr.setRequestHeader("x-ms-blob-content-type", contentType);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`)));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(body);
  });
}
