import type { AnalyzeResultOutput } from "@azure-rest/ai-document-intelligence";
import { describe, expect, it } from "vitest";
import { mapAnalyzeResult } from "./azure-mapping";

function result(fields: Record<string, unknown>, content = ""): AnalyzeResultOutput {
  return {
    apiVersion: "2024-11-30",
    modelId: "prebuilt-invoice",
    stringIndexType: "textElements",
    content,
    pages: [],
    documents: [{ docType: "invoice", confidence: 0.9, spans: [], fields }],
  } as unknown as AnalyzeResultOutput;
}

const money = (amount: number, confidence = 0.9) => ({
  type: "currency",
  valueCurrency: { amount },
  confidence,
});

describe("mapeo de prebuilt-invoice", () => {
  it("detecta ISV 15 % y combina con las regex", () => {
    const r = mapAnalyzeResult(
      result(
        {
          VendorName: { type: "string", valueString: "Ferretería El Martillo", confidence: 0.95 },
          VendorTaxId: { type: "string", valueString: "0801-1990-123456", confidence: 0.6 },
          InvoiceDate: { type: "date", valueDate: "2026-10-15", confidence: 0.9 },
          SubTotal: money(1000),
          TotalTax: money(150),
          InvoiceTotal: money(1150, 0.98),
        },
        "R.T.N. 0801-1990-123456\nCAI: 3A5F1B-2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C",
      ),
    );
    expect(r.fields).toMatchObject({
      razonSocialEmisor: "Ferretería El Martillo",
      rtnEmisor: "08011990123456",
      fechaEmision: "2026-10-15",
      importeGravado15: "1000.00",
      isv15: "150.00",
      total: "1150.00",
      cai: "3A5F1B-2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C",
    });
    // La regex con etiqueta RTN tiene más confianza que el modelo
    expect(r.confidences.rtnEmisor).toBe(0.9);
  });

  it("ISV 18 % y facturas exentas", () => {
    const r18 = mapAnalyzeResult(result({ SubTotal: money(100), TotalTax: money(18) }));
    expect(r18.fields).toMatchObject({ importeGravado18: "100.00", isv18: "18.00" });
    const ex = mapAnalyzeResult(result({ SubTotal: money(250), TotalTax: money(0) }));
    expect(ex.fields).toMatchObject({ importeExento: "250.00" });
  });

  it("tasas mezcladas quedan con baja confianza", () => {
    const r = mapAnalyzeResult(result({ SubTotal: money(1000), TotalTax: money(100) }));
    expect(r.confidences.importeGravado15).toBeLessThan(0.8);
  });
});
