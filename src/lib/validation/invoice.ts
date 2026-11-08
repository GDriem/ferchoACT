import Decimal from "decimal.js";
import { z } from "zod";
import { isValidRtn, normalizeRtn } from "./rtn";

/** CAI del SAR: 6 bloques hexadecimales de 6 caracteres y uno final de 2. */
export const CAI_RE = /^[0-9A-F]{6}(?:-[0-9A-F]{6}){4}-[0-9A-F]{2}$/;
/** Número de factura: establecimiento-punto de emisión-tipo de documento-correlativo. */
export const NUMERO_FACTURA_RE = /^\d{3}-\d{3}-\d{2}-\d{8}$/;

/** Tolerancia para cuadrar ISV y total, en lempiras. */
export const TOLERANCE = new Decimal("0.05");

export function normalizeCai(value: string): string {
  const compact = value.toUpperCase().replace(/[^0-9A-F]/g, "");
  if (compact.length !== 32) return value.trim().toUpperCase();
  return [0, 6, 12, 18, 24].map((i) => compact.slice(i, i + 6)).join("-") + "-" + compact.slice(30);
}

export function normalizeNumeroFactura(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 16) return value.trim();
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8)}`;
}

/** "L 1,234.5" → "1234.50"; vacío → "0.00". Devuelve null si no es un monto. */
export function normalizeMoney(value: string): string | null {
  const clean = value.replace(/[L\s,]/gi, "");
  if (clean === "") return "0.00";
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return new Decimal(clean).toFixed(2);
}

const money = z
  .string()
  .default("")
  .transform((v, ctx) => {
    const n = normalizeMoney(v);
    if (n === null) {
      ctx.addIssue({ code: "custom", message: "Escriba un monto válido, p. ej. 1234.50." });
      return z.NEVER;
    }
    return n;
  });

const isoDate = (required: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: required });

const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || null);

export const invoiceFieldsSchema = z
  .object({
    rtnEmisor: z
      .string()
      .refine(isValidRtn, { error: "El RTN debe tener 14 dígitos." })
      .transform(normalizeRtn),
    razonSocialEmisor: z.string().trim().min(2, { error: "Escriba el nombre del proveedor." }),
    cai: z
      .string()
      .transform(normalizeCai)
      .refine((v) => CAI_RE.test(v), { error: "El CAI tiene el formato XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX." }),
    numeroFactura: z
      .string()
      .transform(normalizeNumeroFactura)
      .refine((v) => NUMERO_FACTURA_RE.test(v), { error: "El número tiene el formato 000-001-01-00000123." }),
    rangoAutorizadoDesde: optionalText
      .transform((v) => (v ? normalizeNumeroFactura(v) : null))
      .refine((v) => !v || NUMERO_FACTURA_RE.test(v), { error: "Formato 000-001-01-00000001." }),
    rangoAutorizadoHasta: optionalText
      .transform((v) => (v ? normalizeNumeroFactura(v) : null))
      .refine((v) => !v || NUMERO_FACTURA_RE.test(v), { error: "Formato 000-001-01-00000001." }),
    fechaEmision: isoDate("Escriba la fecha de emisión."),
    fechaLimiteEmision: isoDate("Escriba la fecha límite de emisión del CAI."),
    rtnComprador: optionalText
      .refine((v) => !v || isValidRtn(v), { error: "El RTN debe tener 14 dígitos." })
      .transform((v) => (v ? normalizeRtn(v) : null)),
    // Cliente de una venta (en compras queda vacío)
    nombreComprador: optionalText.refine((v) => !v || v.length <= 200, { error: "Máximo 200 caracteres." }),
    // Solo compras; el servidor verifica que sea de la empresa o de la lista base
    categoryId: optionalText.refine((v) => !v || z.guid().safeParse(v).success, { error: "Elija una categoría." }),
    importeExento: money,
    importeExonerado: money,
    importeGravado15: money,
    importeGravado18: money,
    isv15: money,
    isv18: money,
    total: money,
  })
  .superRefine((data, ctx) => {
    for (const issue of invoiceConsistencyIssues(data)) {
      ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
    }
  });

export type InvoiceFieldsInput = z.input<typeof invoiceFieldsSchema>;
export type InvoiceFields = z.output<typeof invoiceFieldsSchema>;
export type InvoiceField = keyof InvoiceFields;
/** Valores del formulario: todo texto, tal como se escribe. */
export type InvoiceFormValues = Record<InvoiceField, string>;

export const INVOICE_FIELDS = Object.keys(invoiceFieldsSchema.shape) as InvoiceField[];

/** Valores iniciales: lo guardado o, si aún no se confirmó, lo que propuso el OCR. */
export function initialInvoiceValues(invoice: {
  [K in InvoiceField]: string | null;
} & { confirmedAt: Date | null; ocrFields: Record<string, string> | null }): InvoiceFormValues {
  const ocr = invoice.confirmedAt ? {} : (invoice.ocrFields ?? {});
  return Object.fromEntries(
    INVOICE_FIELDS.map((k) => {
      const saved = invoice[k] ?? "";
      // Los montos sin capturar vienen como "0.00" (default de la columna)
      const empty = saved === "" || saved === "0.00";
      return [k, empty ? (ocr[k] ?? "") : saved];
    }),
  ) as InvoiceFormValues;
}

type ConsistencyInput = Pick<
  InvoiceFields,
  | "importeExento"
  | "importeExonerado"
  | "importeGravado15"
  | "importeGravado18"
  | "isv15"
  | "isv18"
  | "total"
  | "fechaEmision"
  | "fechaLimiteEmision"
  | "numeroFactura"
  | "rangoAutorizadoDesde"
  | "rangoAutorizadoHasta"
>;

const dec = (v: string) => {
  try {
    return new Decimal(v || "0");
  } catch {
    return new Decimal(0);
  }
};

/**
 * Reglas de cuadre de la factura. Se usan en el servidor (zod) y en vivo en
 * el formulario, así el usuario ve el mismo mensaje en los dos lados.
 */
export function invoiceConsistencyIssues(d: ConsistencyInput): { field: InvoiceField; message: string }[] {
  const issues: { field: InvoiceField; message: string }[] = [];
  const g15 = dec(d.importeGravado15);
  const g18 = dec(d.importeGravado18);
  const isv15 = dec(d.isv15);
  const isv18 = dec(d.isv18);

  const expected15 = g15.times("0.15");
  if (isv15.minus(expected15).abs().gt(TOLERANCE)) {
    issues.push({
      field: "isv15",
      message: `El ISV 15 % debería ser L ${expected15.toFixed(2)} (15 % de lo gravado).`,
    });
  }
  const expected18 = g18.times("0.18");
  if (isv18.minus(expected18).abs().gt(TOLERANCE)) {
    issues.push({
      field: "isv18",
      message: `El ISV 18 % debería ser L ${expected18.toFixed(2)} (18 % de lo gravado).`,
    });
  }

  const sum = dec(d.importeExento).plus(dec(d.importeExonerado)).plus(g15).plus(g18).plus(isv15).plus(isv18);
  const total = dec(d.total);
  if (total.lte(0)) {
    issues.push({ field: "total", message: "Escriba el total de la factura." });
  } else if (sum.minus(total).abs().gt(TOLERANCE)) {
    issues.push({
      field: "total",
      message: `Subtotal + ISV suman L ${sum.toFixed(2)}, pero el total es L ${total.toFixed(2)}.`,
    });
  }

  if (d.fechaEmision && d.fechaLimiteEmision && d.fechaEmision > d.fechaLimiteEmision) {
    issues.push({
      field: "fechaEmision",
      message: "La factura se emitió después de la fecha límite de emisión del CAI.",
    });
  }

  const desde = d.rangoAutorizadoDesde;
  const hasta = d.rangoAutorizadoHasta;
  if (desde && hasta && NUMERO_FACTURA_RE.test(d.numeroFactura)) {
    const prefix = (n: string) => n.slice(0, 11);
    const corr = (n: string) => Number(n.slice(11));
    const inRange =
      prefix(desde) === prefix(d.numeroFactura) &&
      prefix(hasta) === prefix(d.numeroFactura) &&
      corr(d.numeroFactura) >= corr(desde) &&
      corr(d.numeroFactura) <= corr(hasta);
    if (!inRange) {
      issues.push({
        field: "numeroFactura",
        message: "El número de factura está fuera del rango autorizado.",
      });
    }
  }

  return issues;
}

/** Período (año, mes) de una fecha "yyyy-mm-dd". La fecha de emisión ya es local de Honduras. */
export function periodOf(fechaEmision: string): { year: number; month: number } {
  const [y, m] = fechaEmision.split("-").map(Number);
  return { year: y, month: m };
}

/** Umbral bajo el cual un campo del OCR se marca "Verifique este dato". */
export const LOW_CONFIDENCE = 0.8;
