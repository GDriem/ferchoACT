import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, formatPeriod } from "./format";

describe("formatos de Honduras", () => {
  it("fechas dd/MM/yyyy", () => {
    expect(formatDate("2026-10-05")).toBe("05/10/2026");
    // 03:00 UTC del 1 de nov. todavía es 31 de oct. en Tegucigalpa (UTC-6)
    expect(formatDate(new Date("2026-11-01T03:00:00Z"))).toBe("31/10/2026");
  });

  it("lempiras", () => {
    expect(formatMoney("1234.5")).toMatch(/L\s?1,234\.50/);
  });

  it("períodos", () => {
    expect(formatPeriod(2026, 10)).toBe("Octubre 2026");
  });
});
