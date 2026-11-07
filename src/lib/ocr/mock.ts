import type { InvoiceOcr } from "./types";

/**
 * OCR de prueba para desarrollar sin Azure: siempre devuelve la misma
 * factura, con algunos campos de baja confianza para ver el resaltado.
 */
export const mockOcr: InvoiceOcr = {
  async extractInvoice() {
    await new Promise((r) => setTimeout(r, 1500));
    return {
      fields: {
        rtnEmisor: "08011990123456",
        razonSocialEmisor: "Ferretería El Martillo S. de R.L.",
        cai: "3A5F1B-2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C",
        numeroFactura: `000-001-01-${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`,
        rangoAutorizadoDesde: "000-001-01-00000001",
        rangoAutorizadoHasta: "000-001-01-99999999",
        fechaLimiteEmision: "2027-03-31",
        fechaEmision: new Date().toLocaleDateString("en-CA", { timeZone: "America/Tegucigalpa" }),
        importeGravado15: "1000.00",
        isv15: "150.00",
        total: "1150.00",
      },
      confidences: {
        rtnEmisor: 0.95,
        razonSocialEmisor: 0.92,
        cai: 0.71,
        numeroFactura: 0.88,
        rangoAutorizadoDesde: 0.9,
        rangoAutorizadoHasta: 0.9,
        fechaLimiteEmision: 0.62,
        fechaEmision: 0.93,
        importeGravado15: 0.85,
        isv15: 0.85,
        total: 0.97,
      },
      raw: { provider: "mock" },
    };
  },
};
