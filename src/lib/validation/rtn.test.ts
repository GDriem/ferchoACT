import { describe, expect, it } from "vitest";
import { formatRtn, isValidRtn, normalizeRtn } from "./rtn";

describe("RTN", () => {
  it("normaliza quitando guiones y espacios", () => {
    expect(normalizeRtn("0801-1990-123456")).toBe("08011990123456");
    expect(normalizeRtn(" 0801 1990 123456 ")).toBe("08011990123456");
  });

  it("valida 14 dígitos", () => {
    expect(isValidRtn("0801-1990-123456")).toBe(true);
    expect(isValidRtn("0801199012345")).toBe(false);
    expect(isValidRtn("0801-1990-12345A")).toBe(false);
  });

  it("formatea con guiones", () => {
    expect(formatRtn("08011990123456")).toBe("0801-1990-123456");
    expect(formatRtn("123")).toBe("123");
  });
});
