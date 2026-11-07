import Decimal from "decimal.js";

/** Lo mínimo de una factura que necesitan los reportes (montos como texto decimal). */
export type ReportInvoice = {
  fechaEmision: string; // yyyy-mm-dd
  numeroFactura: string; // 000-001-01-00000123
  razonSocialEmisor: string | null;
  rtnEmisor: string | null;
  categoryName: string | null;
  importeExento: string;
  importeExonerado: string;
  importeGravado15: string;
  importeGravado18: string;
  isv15: string;
  isv18: string;
  total: string;
};

export type Amounts = { exento: string; gravado: string; impuesto: string; total: string };

const amountsOf = (i: ReportInvoice) => ({
  // El exonerado va junto con el exento, como en el libro del contador
  exento: new Decimal(i.importeExento).plus(i.importeExonerado),
  gravado: new Decimal(i.importeGravado15).plus(i.importeGravado18),
  impuesto: new Decimal(i.isv15).plus(i.isv18),
  total: new Decimal(i.total),
});

type Acc = ReturnType<typeof amountsOf>;
const zero = (): Acc => ({ exento: new Decimal(0), gravado: new Decimal(0), impuesto: new Decimal(0), total: new Decimal(0) });
const add = (a: Acc, b: Acc): Acc => ({
  exento: a.exento.plus(b.exento),
  gravado: a.gravado.plus(b.gravado),
  impuesto: a.impuesto.plus(b.impuesto),
  total: a.total.plus(b.total),
});
const fixed = (a: Acc): Amounts => ({
  exento: a.exento.toFixed(2),
  gravado: a.gravado.toFixed(2),
  impuesto: a.impuesto.toFixed(2),
  total: a.total.toFixed(2),
});

/**
 * Comprime números de factura en rangos: [168, 169, 171] → "168-169, 171".
 * Si en el mes hay más de un prefijo (establecimiento/punto de emisión), se
 * muestra el prefijo para no confundirlos.
 */
export function compressInvoiceNumbers(numbers: string[], withPrefix: boolean) {
  const byPrefix = new Map<string, number[]>();
  for (const n of numbers) {
    const prefix = n.slice(0, 10);
    byPrefix.set(prefix, [...(byPrefix.get(prefix) ?? []), Number(n.slice(11))]);
  }
  const parts: string[] = [];
  for (const [prefix, list] of [...byPrefix].sort(([a], [b]) => a.localeCompare(b))) {
    const sorted = [...new Set(list)].sort((a, b) => a - b);
    const label = (n: number) => (withPrefix ? `${prefix}-${n}` : String(n));
    let start = sorted[0];
    let prev = sorted[0];
    for (const n of [...sorted.slice(1), Number.NaN]) {
      if (n === prev + 1) {
        prev = n;
        continue;
      }
      parts.push(start === prev ? label(start) : `${label(start)}-${prev}`);
      start = n;
      prev = n;
    }
  }
  return parts.join(", ");
}

export type SalesBookRow = Amounts & { day: number; numbers: string; count: number };

/** Libro de ventas: una fila por día con el rango de facturas y los totales del día. */
export function buildSalesBook(invoices: ReportInvoice[]) {
  const withPrefix = new Set(invoices.map((i) => i.numeroFactura.slice(0, 10))).size > 1;
  const byDay = new Map<number, ReportInvoice[]>();
  for (const i of invoices) {
    const day = Number(i.fechaEmision.slice(8, 10));
    byDay.set(day, [...(byDay.get(day) ?? []), i]);
  }
  let grand = zero();
  const rows: SalesBookRow[] = [...byDay]
    .sort(([a], [b]) => a - b)
    .map(([day, list]) => {
      const sum = list.map(amountsOf).reduce(add, zero());
      grand = add(grand, sum);
      return {
        day,
        numbers: compressInvoiceNumbers(
          list.map((i) => i.numeroFactura),
          withPrefix,
        ),
        count: list.length,
        ...fixed(sum),
      };
    });
  return { rows, totals: fixed(grand), count: invoices.length };
}

export const NO_CATEGORY = "Sin categoría";

/** Compras y gastos agrupados por categoría, con subtotales y total general. */
export function buildPurchasesByCategory(invoices: ReportInvoice[]) {
  const byCategory = new Map<string, ReportInvoice[]>();
  for (const i of invoices) {
    const key = i.categoryName ?? NO_CATEGORY;
    byCategory.set(key, [...(byCategory.get(key) ?? []), i]);
  }
  let grand = zero();
  const groups = [...byCategory]
    // Alfabético, con "Sin categoría" al final para que salte a la vista
    .sort(([a], [b]) => (a === NO_CATEGORY ? 1 : b === NO_CATEGORY ? -1 : a.localeCompare(b, "es")))
    .map(([category, list]) => {
      const sorted = [...list].sort(
        (a, b) => a.fechaEmision.localeCompare(b.fechaEmision) || a.numeroFactura.localeCompare(b.numeroFactura),
      );
      const sum = sorted.map(amountsOf).reduce(add, zero());
      grand = add(grand, sum);
      return {
        category,
        rows: sorted.map((i) => ({ ...i, ...fixed(amountsOf(i)) })),
        subtotal: fixed(sum),
      };
    });
  return { groups, totals: fixed(grand), count: invoices.length };
}
