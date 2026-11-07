export const TIME_ZONE = "America/Tegucigalpa";

const dateFmt = new Intl.DateTimeFormat("es-HN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const moneyFmt = new Intl.NumberFormat("es-HN", { style: "currency", currency: "HNL" });

/** dd/MM/yyyy en hora de Honduras. Acepta Date o "yyyy-mm-dd" (columna date). */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  if (typeof value === "string") {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return dateFmt.format(value);
}

/** "1234.5" → "L 1,234.50". Los montos llegan como string (numeric). */
export function formatMoney(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return moneyFmt.format(Number(value));
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

/** (2026, 10) → "Octubre 2026" */
export function formatPeriod(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}
