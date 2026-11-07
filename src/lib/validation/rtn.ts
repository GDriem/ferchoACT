/** Quita guiones/espacios. El RTN se guarda como 14 dígitos. */
export function normalizeRtn(value: string): string {
  return value.replace(/[\s-]/g, "");
}

export function isValidRtn(value: string): boolean {
  return /^\d{14}$/.test(normalizeRtn(value));
}

/** 08011990123456 → 0801-1990-123456 */
export function formatRtn(rtn: string): string {
  const d = normalizeRtn(rtn);
  if (d.length !== 14) return rtn;
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${d.slice(8)}`;
}
