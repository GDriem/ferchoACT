/** Resultado de las server actions que no son formularios (no lanzan hacia la UI). */
export type ActionResult<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

export const fail = (code: string, message: string) => ({ ok: false as const, error: { code, message } });
