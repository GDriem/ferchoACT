import { describe, expect, it } from "vitest";
import {
  invoiceFieldsSchema,
  normalizeCai,
  normalizeMoney,
  normalizeNumeroFactura,
  periodOf,
  type InvoiceFieldsInput,
} from "./invoice";

const valid: InvoiceFieldsInput = {
  rtnEmisor: "0801-1990-123456",
  razonSocialEmisor: "Ferretería El Martillo",
  cai: "3a5f1b-2c4d6e-8f0a1b-2c3d4e-5f6a7b-8c",
  numeroFactura: "000-001-01-00000123",
  rangoAutorizadoDesde: "000-001-01-00000001",
  rangoAutorizadoHasta: "000-001-01-00005000",
  fechaEmision: "2026-10-15",
  fechaLimiteEmision: "2027-03-31",
  rtnComprador: "",
  importeExento: "100",
  importeExonerado: "",
  importeGravado15: "1,000.00",
  importeGravado18: "200",
  isv15: "150",
  isv18: "36",
  total: "L 1,486.00",
};

function errorsOf(input: InvoiceFieldsInput) {
  const r = invoiceFieldsSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
}

describe("validación de factura SAR", () => {
  it("acepta una factura que cuadra y normaliza formatos", () => {
    const r = invoiceFieldsSchema.parse(valid);
    expect(r.rtnEmisor).toBe("08011990123456");
    expect(r.cai).toBe("3A5F1B-2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C");
    expect(r.importeGravado15).toBe("1000.00");
    expect(r.importeExonerado).toBe("0.00");
    expect(r.total).toBe("1486.00");
    expect(r.rtnComprador).toBeNull();
  });

  it("ISV 15 % y 18 % deben cuadrar con lo gravado", () => {
    expect(errorsOf({ ...valid, isv15: "140", total: "1476" })).toHaveProperty("isv15");
    expect(errorsOf({ ...valid, isv18: "30", total: "1480" })).toHaveProperty("isv18");
    // Dentro de la tolerancia de L 0.05
    expect(errorsOf({ ...valid, isv15: "150.04", total: "1486.04" })).toEqual({});
  });

  it("subtotal + ISV = total con tolerancia de L 0.05", () => {
    expect(errorsOf({ ...valid, total: "1486.05" })).toEqual({});
    expect(errorsOf({ ...valid, total: "1486.06" })).toHaveProperty("total");
    expect(errorsOf({ ...valid, total: "0" })).toHaveProperty("total");
  });

  it("formato de CAI, RTN y número de factura", () => {
    expect(errorsOf({ ...valid, cai: "ABC-123" })).toHaveProperty("cai");
    expect(errorsOf({ ...valid, rtnEmisor: "0801-1990" })).toHaveProperty("rtnEmisor");
    expect(errorsOf({ ...valid, numeroFactura: "001-01-123" })).toHaveProperty("numeroFactura");
    expect(errorsOf({ ...valid, rtnComprador: "123" })).toHaveProperty("rtnComprador");
  });

  it("la fecha de emisión no puede pasar la fecha límite del CAI", () => {
    expect(errorsOf({ ...valid, fechaEmision: "2027-04-01" })).toHaveProperty("fechaEmision");
    expect(errorsOf({ ...valid, fechaEmision: "2027-03-31" })).toEqual({});
  });

  it("el número debe estar dentro del rango autorizado", () => {
    expect(errorsOf({ ...valid, numeroFactura: "000-001-01-00005001" })).toHaveProperty("numeroFactura");
    expect(errorsOf({ ...valid, numeroFactura: "000-002-01-00000123" })).toHaveProperty("numeroFactura");
  });

  it("normalizadores", () => {
    expect(normalizeNumeroFactura("0000010100000123")).toBe("000-001-01-00000123");
    expect(normalizeNumeroFactura("000 001 01 00000123")).toBe("000-001-01-00000123");
    expect(normalizeNumeroFactura("00000101000001")).toBe("00000101000001"); // incompleto: no se toca
    expect(normalizeCai("3A5F1B 2C4D6E 8F0A1B 2C3D4E 5F6A7B 8C")).toBe("3A5F1B-2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C");
    expect(normalizeMoney("abc")).toBeNull();
    expect(periodOf("2026-10-31")).toEqual({ year: 2026, month: 10 });
  });
});
