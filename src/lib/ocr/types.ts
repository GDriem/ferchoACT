import type { InvoiceField } from "@/lib/validation/invoice";

export type OcrFields = Partial<Record<InvoiceField, string>>;
export type OcrConfidences = Partial<Record<InvoiceField, number>>;

export type OcrResult = {
  /** Valores como texto, ya en el formato del formulario (fechas ISO, montos "1234.50"). */
  fields: OcrFields;
  /** Confianza 0-1 por campo; los que faltan se tratan como 0. */
  confidences: OcrConfidences;
  /** Respuesta cruda del proveedor, para depurar. */
  raw?: unknown;
};

export type OcrInput = { data: Uint8Array; contentType: string };

/** Toda la lógica de OCR vive detrás de esta interfaz (Azure, mock o un modelo custom). */
export interface InvoiceOcr {
  extractInvoice(file: OcrInput): Promise<OcrResult>;
}
