import type { AnalyzeResultOutput, DocumentFieldOutput } from "@azure-rest/ai-document-intelligence";
import Decimal from "decimal.js";
import { normalizeNumeroFactura, NUMERO_FACTURA_RE } from "@/lib/validation/invoice";
import { parseHondurasText } from "./honduras";
import type { OcrConfidences, OcrFields, OcrResult } from "./types";

const amountOf = (f?: DocumentFieldOutput) =>
  f?.valueCurrency?.amount ?? f?.valueNumber ?? undefined;

/** Convierte la salida de prebuilt-invoice a los campos SAR, con su confianza. */
export function mapAnalyzeResult(result: AnalyzeResultOutput): OcrResult {
  const doc = result.documents?.[0];
  const f = doc?.fields ?? {};
  const fields: OcrFields = {};
  const confidences: OcrConfidences = {};
  const set = (k: keyof OcrFields, v: string | undefined, c: number | undefined) => {
    if (!v) return;
    fields[k] = v;
    confidences[k] = c ?? 0;
  };

  const text = (x?: DocumentFieldOutput) => x?.valueString ?? x?.content;
  const digits = (x?: DocumentFieldOutput) => text(x)?.replace(/\D/g, "");

  set("razonSocialEmisor", text(f.VendorName)?.trim(), f.VendorName?.confidence);
  const vendorRtn = digits(f.VendorTaxId);
  if (vendorRtn?.length === 14) set("rtnEmisor", vendorRtn, f.VendorTaxId?.confidence);
  set("nombreComprador", text(f.CustomerName)?.trim(), f.CustomerName?.confidence);
  const buyerRtn = digits(f.CustomerTaxId);
  if (buyerRtn?.length === 14) set("rtnComprador", buyerRtn, f.CustomerTaxId?.confidence);
  const invoiceId = text(f.InvoiceId) && normalizeNumeroFactura(text(f.InvoiceId)!);
  if (invoiceId && NUMERO_FACTURA_RE.test(invoiceId)) set("numeroFactura", invoiceId, f.InvoiceId?.confidence);
  set("fechaEmision", f.InvoiceDate?.valueDate, f.InvoiceDate?.confidence);

  // Montos: prebuilt-invoice da subtotal e impuesto; la tasa decide si es 15 % o 18 %
  const subtotal = amountOf(f.SubTotal);
  const tax = amountOf(f.TotalTax);
  const total = amountOf(f.InvoiceTotal);
  if (total !== undefined) set("total", new Decimal(total).toFixed(2), f.InvoiceTotal?.confidence);
  if (subtotal !== undefined) {
    const base = new Decimal(subtotal);
    const isv = new Decimal(tax ?? 0);
    const c = Math.min(f.SubTotal?.confidence ?? 0, f.TotalTax?.confidence ?? f.SubTotal?.confidence ?? 0);
    const rate = base.isZero() ? new Decimal(0) : isv.div(base);
    if (isv.isZero()) {
      set("importeExento", base.toFixed(2), c);
    } else if (rate.minus("0.15").abs().lt("0.005")) {
      set("importeGravado15", base.toFixed(2), c);
      set("isv15", isv.toFixed(2), c);
    } else if (rate.minus("0.18").abs().lt("0.005")) {
      set("importeGravado18", base.toFixed(2), c);
      set("isv18", isv.toFixed(2), c);
    } else {
      // Mezcla de tasas o exento + gravado: se propone 15 % y se pide verificar
      set("importeGravado15", base.toFixed(2), 0.4);
      set("isv15", isv.toFixed(2), 0.4);
    }
  }

  // Las regex completan lo que el modelo no conoce y ganan si tienen más confianza
  const hn = parseHondurasText(result.content ?? "");
  for (const [k, v] of Object.entries(hn.fields) as [keyof OcrFields, string][]) {
    const c = hn.confidences[k] ?? 0;
    if (!fields[k] || c > (confidences[k] ?? 0)) set(k, v, c);
  }

  return { fields, confidences, raw: { modelId: result.modelId, content: result.content, fields: f } };
}
