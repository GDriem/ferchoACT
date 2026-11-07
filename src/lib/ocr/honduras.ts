import type { OcrConfidences, OcrFields } from "./types";

// Las regex toleran espacios que el OCR mete alrededor de los guiones
const CAI = /(?:[0-9A-F]{6}\s*-\s*){5}[0-9A-F]{2}\b/gi;
const NUMERO = /\b\d{3}\s*-\s*\d{3}\s*-\s*\d{2}\s*-\s*\d{8}\b/g;
const RTN = /R\.?\s*T\.?\s*N\.?([^\d\n]{0,30})(\d{4}[-\s]?\d{4}[-\s]?\d{6})\b/gi;
const DATE = String.raw`(\d{1,2})\s*[/-]\s*(\d{1,2})\s*[/-]\s*(\d{4})`;

const compact = (s: string) => s.replace(/\s+/g, "");
const LABELED = 0.9;
const UNLABELED = 0.65;

function isoDate(d: string, m: string, y: string): string | undefined {
  const day = Number(d);
  const month = Number(m);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Campos que prebuilt-invoice no conoce (CAI, rango autorizado, fecha límite)
 * y respaldo para RTN y número de factura, sacados del texto completo.
 */
export function parseHondurasText(content: string): { fields: OcrFields; confidences: OcrConfidences } {
  const fields: OcrFields = {};
  const confidences: OcrConfidences = {};
  const set = (k: keyof OcrFields, v: string | undefined, c: number) => {
    if (v === undefined) return;
    fields[k] = v;
    confidences[k] = c;
  };

  const cais = [...new Set([...content.matchAll(CAI)].map((m) => compact(m[0]).toUpperCase()))];
  if (cais.length) set("cai", cais[0], cais.length === 1 ? LABELED : UNLABELED);

  const rango = content.match(
    /rango[^\n]*?(\d{3}\s*-\s*\d{3}\s*-\s*\d{2}\s*-\s*\d{8})[\s\S]{0,40}?(\d{3}\s*-\s*\d{3}\s*-\s*\d{2}\s*-\s*\d{8})/i,
  );
  const desde = rango ? compact(rango[1]) : undefined;
  const hasta = rango ? compact(rango[2]) : undefined;
  set("rangoAutorizadoDesde", desde, LABELED);
  set("rangoAutorizadoHasta", hasta, LABELED);

  const labeled = content.match(
    /factura\s*(?:n[o°º.]*|#|n[uú]mero)?\s*:?\s*(\d{3}\s*-\s*\d{3}\s*-\s*\d{2}\s*-\s*\d{8})/i,
  );
  if (labeled) {
    set("numeroFactura", compact(labeled[1]), LABELED);
  } else {
    const others = [...content.matchAll(NUMERO)].map((m) => compact(m[0])).filter((n) => n !== desde && n !== hasta);
    if (others.length) set("numeroFactura", others[0], UNLABELED);
  }

  for (const m of content.matchAll(RTN)) {
    const rtn = m[2].replace(/\D/g, "");
    const isBuyer = /cliente|comprador|adquiriente/i.test(m[1]);
    if (isBuyer && !fields.rtnComprador) set("rtnComprador", rtn, LABELED);
    else if (!isBuyer && !fields.rtnEmisor) set("rtnEmisor", rtn, LABELED);
  }

  const limite = content.match(new RegExp(String.raw`fecha\s+l[ií]mite[^\d\n]{0,40}` + DATE, "i"));
  if (limite) set("fechaLimiteEmision", isoDate(limite[1], limite[2], limite[3]), LABELED);

  const emision = content.match(new RegExp(String.raw`fecha(?!\s+l[ií]mite)(?:\s+de\s+emisi[oó]n)?[^\d\n]{0,15}` + DATE, "i"));
  if (emision) set("fechaEmision", isoDate(emision[1], emision[2], emision[3]), UNLABELED);

  return { fields, confidences };
}
