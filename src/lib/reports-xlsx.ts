import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import ExcelJS from "exceljs";
import { db } from "@/db";
import { companies, expenseCategories, invoices, taxPeriods, type InvoiceKind } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth/access";
import { formatDate, formatPeriod } from "@/lib/format";
import { buildPurchasesByCategory, buildSalesBook, type Amounts, type ReportInvoice } from "@/lib/reports";
import { formatRtn } from "@/lib/validation/rtn";

/**
 * Facturas del período que entran a los reportes de trabajo del contador:
 * confirmadas con fecha y número, sin las rechazadas. Las "por revisar" se
 * incluyen y se cuentan aparte para avisarlo en el archivo.
 */
async function reportInvoices(companyId: string, year: number, month: number, kind: InvoiceKind) {
  await requireCompanyAccess(companyId, "invoice:read_all");
  const [company] = await db
    .select({ legalName: companies.legalName, rtn: companies.rtn })
    .from(companies)
    .where(eq(companies.id, companyId));
  const rows = await db
    .select({
      status: invoices.status,
      fechaEmision: invoices.fechaEmision,
      numeroFactura: invoices.numeroFactura,
      razonSocialEmisor: invoices.razonSocialEmisor,
      rtnEmisor: invoices.rtnEmisor,
      categoryName: expenseCategories.name,
      importeExento: invoices.importeExento,
      importeExonerado: invoices.importeExonerado,
      importeGravado15: invoices.importeGravado15,
      importeGravado18: invoices.importeGravado18,
      isv15: invoices.isv15,
      isv18: invoices.isv18,
      total: invoices.total,
    })
    .from(invoices)
    .innerJoin(taxPeriods, eq(invoices.periodId, taxPeriods.id))
    .leftJoin(expenseCategories, eq(invoices.categoryId, expenseCategories.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.kind, kind),
        eq(taxPeriods.year, year),
        eq(taxPeriods.month, month),
        inArray(invoices.status, ["needs_review", "validated", "declared"]),
        isNotNull(invoices.fechaEmision),
        isNotNull(invoices.numeroFactura),
      ),
    );
  return {
    company,
    invoices: rows as (ReportInvoice & { status: string })[],
    pending: rows.filter((r) => r.status === "needs_review").length,
  };
}

const MONEY_FORMAT = '"L"#,##0.00';
const thin = { style: "thin" as const };
const border = { top: thin, left: thin, bottom: thin, right: thin };

function title(sheet: ExcelJS.Worksheet, text: string, pending: number, columns: number) {
  sheet.addRow([text]).font = { bold: true, size: 13 };
  sheet.mergeCells(1, 1, 1, columns);
  if (pending > 0) {
    const note = sheet.addRow([
      `Atención: ${pending} ${pending === 1 ? "factura está" : "facturas están"} por revisar y se incluyen en este reporte.`,
    ]);
    note.font = { italic: true, color: { argb: "FF9A6700" } };
    sheet.mergeCells(note.number, 1, note.number, columns);
  }
}

function header(sheet: ExcelJS.Worksheet, labels: string[]) {
  const row = sheet.addRow(labels);
  row.font = { bold: true };
  row.eachCell((c) => {
    c.border = border;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFEF" } };
  });
  return row;
}

const num = (v: string) => Number(v);

/** Libro de ventas con el formato del contador: Día · N.º de factura · Exento · Gravado · Impuesto · TOTAL. */
export async function salesBookXlsx(companyId: string, year: number, month: number) {
  const data = await reportInvoices(companyId, year, month, "sale");
  const book = buildSalesBook(data.invoices);

  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Ventas");
  sheet.columns = [{ width: 7 }, { width: 36 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }];
  title(sheet, `Ventas ${data.company.legalName} - ${formatPeriod(year, month)}`, data.pending, 6);
  const head = header(sheet, ["Día", "Número de factura", "Exento", "Gravado", "Impuesto", "TOTAL"]);

  const first = head.number + 1;
  for (const r of book.rows) {
    const row = sheet.addRow([r.day, r.numbers, num(r.exento) || null, num(r.gravado), num(r.impuesto)]);
    // El total es fórmula, igual que en la hoja del contador, para que cuadre si se edita
    row.getCell(6).value = { formula: `SUM(C${row.number}:E${row.number})`, result: num(r.total) };
  }
  const last = sheet.lastRow!.number;
  const totals = sheet.addRow([null, `${book.count} facturas`]);
  for (const [i, col] of ["C", "D", "E", "F"].entries()) {
    const key = (["exento", "gravado", "impuesto", "total"] as const)[i];
    totals.getCell(i + 3).value =
      book.rows.length > 0
        ? { formula: `SUM(${col}${first}:${col}${last})`, result: num(book.totals[key]) }
        : 0;
  }
  totals.font = { bold: true };
  totals.eachCell({ includeEmpty: true }, (c) => (c.border = { ...border, top: { style: "medium" } }));

  for (const col of ["C", "D", "E", "F"]) sheet.getColumn(col).numFmt = MONEY_FORMAT;
  return { buffer: await wb.xlsx.writeBuffer(), company: data.company };
}

/** Compras y gastos ordenados por categoría, con subtotales, y una hoja de resumen. */
export async function purchasesXlsx(companyId: string, year: number, month: number) {
  const data = await reportInvoices(companyId, year, month, "purchase");
  const report = buildPurchasesByCategory(data.invoices);

  const wb = new ExcelJS.Workbook();
  const summary = wb.addWorksheet("Resumen");
  const detail = wb.addWorksheet("Detalle");

  const period = formatPeriod(year, month);
  summary.columns = [{ width: 40 }, { width: 10 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 16 }];
  title(summary, `Compras y gastos ${data.company.legalName} - ${period}`, data.pending, 6);
  header(summary, ["Categoría", "Facturas", "Exento", "Gravado", "ISV", "Total"]);
  const amounts = (a: Amounts) => [num(a.exento), num(a.gravado), num(a.impuesto), num(a.total)];
  for (const g of report.groups) summary.addRow([g.category, g.rows.length, ...amounts(g.subtotal)]);
  const sumRow = summary.addRow(["Total", report.count, ...amounts(report.totals)]);
  sumRow.font = { bold: true };
  sumRow.eachCell((c) => (c.border = { top: { style: "medium" } }));
  for (const col of ["C", "D", "E", "F"]) summary.getColumn(col).numFmt = MONEY_FORMAT;

  detail.columns = [
    { width: 12 },
    { width: 36 },
    { width: 18 },
    { width: 22 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
  ];
  title(detail, `Detalle de compras y gastos - ${period}`, data.pending, 8);
  for (const g of report.groups) {
    const groupRow = detail.addRow([g.category]);
    groupRow.font = { bold: true, size: 12 };
    header(detail, ["Fecha", "Proveedor", "RTN", "N.º de factura", "Exento", "Gravado", "ISV", "Total"]);
    for (const r of g.rows) {
      detail.addRow([
        formatDate(r.fechaEmision),
        r.razonSocialEmisor,
        r.rtnEmisor ? formatRtn(r.rtnEmisor) : "",
        r.numeroFactura,
        ...amounts(r),
      ]);
    }
    const sub = detail.addRow([null, `Subtotal ${g.category}`, null, null, ...amounts(g.subtotal)]);
    sub.font = { bold: true };
    detail.addRow([]);
  }
  const grand = detail.addRow([null, "Total general", null, null, ...amounts(report.totals)]);
  grand.font = { bold: true };
  grand.eachCell((c) => (c.border = { top: { style: "medium" } }));
  for (const col of ["E", "F", "G", "H"]) detail.getColumn(col).numFmt = MONEY_FORMAT;

  return { buffer: await wb.xlsx.writeBuffer(), company: data.company };
}
