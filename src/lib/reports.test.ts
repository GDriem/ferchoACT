import { describe, expect, it } from "vitest";
import { buildPurchasesByCategory, buildSalesBook, compressInvoiceNumbers, NO_CATEGORY, type ReportInvoice } from "./reports";

const inv = (over: Partial<ReportInvoice>): ReportInvoice => ({
  fechaEmision: "2026-10-01",
  numeroFactura: "000-001-01-00000001",
  razonSocialEmisor: "Proveedor",
  rtnEmisor: "08011990123456",
  categoryName: null,
  importeExento: "0.00",
  importeExonerado: "0.00",
  importeGravado15: "0.00",
  importeGravado18: "0.00",
  isv15: "0.00",
  isv18: "0.00",
  total: "0.00",
  ...over,
});
const n = (corr: number, prefix = "000-001-01") => `${prefix}-${String(corr).padStart(8, "0")}`;

describe("compressInvoiceNumbers", () => {
  it("junta correlativos seguidos en rangos", () => {
    expect(compressInvoiceNumbers([n(169), n(168)], false)).toBe("168-169");
    expect(compressInvoiceNumbers([n(170), n(168), n(171), n(175)], false)).toBe("168, 170-171, 175");
    expect(compressInvoiceNumbers([n(172)], false)).toBe("172");
  });

  it("muestra el prefijo cuando hay varios puntos de emisión", () => {
    expect(compressInvoiceNumbers([n(5, "000-002-01"), n(6, "000-002-01"), n(9)], true)).toBe(
      "000-001-01-9, 000-002-01-5-6",
    );
  });
});

describe("buildSalesBook", () => {
  it("reproduce el libro de ventas del contador: una fila por día y totales", () => {
    const sale = (day: number, corr: number, gravado: string, isv: string, total: string) =>
      inv({
        fechaEmision: `2026-10-${String(day).padStart(2, "0")}`,
        numeroFactura: n(corr),
        importeGravado15: gravado,
        isv15: isv,
        total,
      });
    const book = buildSalesBook([
      sale(2, 170, "543.48", "81.52", "625.00"),
      sale(1, 168, "608.70", "91.30", "700.00"),
      sale(1, 169, "608.69", "91.31", "700.00"),
      sale(2, 171, "543.48", "81.52", "625.00"),
      sale(5, 172, "1217.39", "182.61", "1400.00"),
    ]);
    expect(book.rows).toEqual([
      { day: 1, numbers: "168-169", count: 2, exento: "0.00", gravado: "1217.39", impuesto: "182.61", total: "1400.00" },
      { day: 2, numbers: "170-171", count: 2, exento: "0.00", gravado: "1086.96", impuesto: "163.04", total: "1250.00" },
      { day: 5, numbers: "172", count: 1, exento: "0.00", gravado: "1217.39", impuesto: "182.61", total: "1400.00" },
    ]);
    expect(book.totals).toEqual({ exento: "0.00", gravado: "3521.74", impuesto: "528.26", total: "4050.00" });
    expect(book.count).toBe(5);
  });

  it("suma 15 % y 18 %, y el exonerado va con el exento", () => {
    const book = buildSalesBook([
      inv({
        importeExento: "10.00",
        importeExonerado: "5.00",
        importeGravado15: "100.00",
        isv15: "15.00",
        importeGravado18: "100.00",
        isv18: "18.00",
        total: "248.00",
      }),
    ]);
    expect(book.rows[0]).toMatchObject({ exento: "15.00", gravado: "200.00", impuesto: "33.00", total: "248.00" });
  });

  it("sin ventas devuelve totales en cero", () => {
    expect(buildSalesBook([])).toEqual({
      rows: [],
      totals: { exento: "0.00", gravado: "0.00", impuesto: "0.00", total: "0.00" },
      count: 0,
    });
  });
});

describe("buildPurchasesByCategory", () => {
  it("agrupa por categoría con subtotales; «Sin categoría» va al final", () => {
    const report = buildPurchasesByCategory([
      inv({ categoryName: "Combustible", fechaEmision: "2026-10-09", importeGravado15: "100.00", isv15: "15.00", total: "115.00" }),
      inv({ categoryName: null, importeExento: "50.00", total: "50.00" }),
      inv({ categoryName: "Alquiler", importeGravado15: "1000.00", isv15: "150.00", total: "1150.00" }),
      inv({ categoryName: "Combustible", fechaEmision: "2026-10-02", importeGravado15: "200.00", isv15: "30.00", total: "230.00" }),
    ]);
    expect(report.groups.map((g) => g.category)).toEqual(["Alquiler", "Combustible", NO_CATEGORY]);
    const fuel = report.groups[1];
    expect(fuel.rows.map((r) => r.fechaEmision)).toEqual(["2026-10-02", "2026-10-09"]);
    expect(fuel.subtotal).toEqual({ exento: "0.00", gravado: "300.00", impuesto: "45.00", total: "345.00" });
    expect(report.totals).toEqual({ exento: "50.00", gravado: "1300.00", impuesto: "195.00", total: "1545.00" });
  });
});
