import { describe, expect, it } from "vitest";
import { parseHondurasText } from "./honduras";

const sample = `FERRETERIA EL MARTILLO S. DE R.L.
R.T.N. 0801-1990-123456
CAI: 3A5F1B - 2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C
Rango autorizado: 000-001-01-00000001 al 000-001-01-00005000
Fecha límite de emisión: 31/03/2027
FACTURA No. 000-001-01-00000123
Fecha: 15/10/2026
RTN Cliente: 08019005654321
Total L 1,486.00`;

describe("regex de facturas hondureñas", () => {
  it("extrae CAI, rango, número, RTN y fechas", () => {
    const { fields, confidences } = parseHondurasText(sample);
    expect(fields).toEqual({
      cai: "3A5F1B-2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C",
      rangoAutorizadoDesde: "000-001-01-00000001",
      rangoAutorizadoHasta: "000-001-01-00005000",
      numeroFactura: "000-001-01-00000123",
      rtnEmisor: "08011990123456",
      rtnComprador: "08019005654321",
      fechaLimiteEmision: "2027-03-31",
      fechaEmision: "2026-10-15",
    });
    expect(confidences.cai).toBeGreaterThanOrEqual(0.8);
    // La fecha de emisión sin etiqueta clara queda para verificar
    expect(confidences.fechaEmision).toBeLessThan(0.8);
  });

  it("sin etiqueta, toma el número que no es parte del rango y baja la confianza", () => {
    const { fields, confidences } = parseHondurasText(
      "Rango 000-001-01-00000001 hasta 000-001-01-00005000\n000-001-01-00000777",
    );
    expect(fields.numeroFactura).toBe("000-001-01-00000777");
    expect(confidences.numeroFactura).toBeLessThan(0.8);
  });

  it("texto sin datos no inventa campos", () => {
    expect(parseHondurasText("Gracias por su compra").fields).toEqual({});
  });
});
