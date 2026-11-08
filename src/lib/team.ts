import "server-only";
import { randomInt } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { accountantClients, auditLog, companyMembers, users } from "@/db/schema";
import { requireCompanyAccess, requireUser } from "@/lib/auth/access";

export class TeamError extends Error {
  constructor(
    public code: "not_found" | "already_linked" | "invalid",
    message: string,
  ) {
    super(message);
  }
}

// Sin 0/O, 1/I/L para que se pueda dictar por teléfono sin confusiones
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Código de contador "XXXX-XXXX" (31^8 ≈ 850 mil millones de combinaciones). */
export function generateAccountantCode() {
  const chars = Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]);
  return `${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

/** " abcd 2345 " → "ABCD-2345"; null si no tiene la forma de un código. */
export function normalizeAccountantCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (compact.length !== 8 || [...compact].some((c) => !CODE_ALPHABET.includes(c))) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

/**
 * Devuelve el código del usuario, creándolo si aún no tiene. Solo escribe
 * si sigue vacío: dos renders a la vez no se pisan el código.
 */
export async function ensureAccountantCode(userId: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const [current] = await db.select({ code: users.accountantCode }).from(users).where(eq(users.id, userId));
    if (current?.code) return current.code;
    try {
      const [row] = await db
        .update(users)
        .set({ accountantCode: generateAccountantCode() })
        .where(and(eq(users.id, userId), isNull(users.accountantCode)))
        .returning({ code: users.accountantCode });
      // Si otro proceso lo creó primero, la próxima vuelta lo lee
      if (row?.code) return row.code;
    } catch (e) {
      // Choque con otro código (muy improbable): se intenta otro
      const err = e as { code?: string; cause?: { code?: string } };
      if (err.code !== "23505" && err.cause?.code !== "23505") throw e;
    }
  }
  throw new Error("No se pudo generar el código de contador");
}

/** La persona en sesión se declara contador: obtiene su código para compartir. */
export async function becomeAccountant() {
  const user = await requireUser();
  if (!user.isAccountant) {
    await db.update(users).set({ isAccountant: true }).where(eq(users.id, user.id));
  }
  return ensureAccountantCode(user.id);
}

async function accountantByCode(rawCode: string) {
  const code = normalizeAccountantCode(rawCode);
  if (!code) throw new TeamError("invalid", "El código tiene 8 letras y números, p. ej. K7QM-4XPA.");
  const [accountant] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.accountantCode, code), eq(users.isAccountant, true)));
  if (!accountant) throw new TeamError("not_found", "No encontramos un contador con ese código. Revíselo con su contador.");
  return accountant;
}

/** Paso 1: el owner escribe el código y ve a quién va a vincular antes de confirmar. */
export async function previewAccountantByCode(companyId: string, code: string) {
  await requireCompanyAccess(companyId, "members:manage");
  const accountant = await accountantByCode(code);
  const [linked] = await db
    .select({ id: accountantClients.accountantId })
    .from(accountantClients)
    .where(and(eq(accountantClients.companyId, companyId), eq(accountantClients.accountantId, accountant.id)));
  if (linked) throw new TeamError("already_linked", `${accountant.name} ya es contador de esta empresa.`);
  return accountant;
}

/** Paso 2: vincula al contador. Desde ese momento ve las facturas de la empresa. */
export async function linkAccountantByCode(companyId: string, code: string) {
  const { user } = await requireCompanyAccess(companyId, "members:manage");
  const accountant = await accountantByCode(code);
  await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(accountantClients)
      .values({ accountantId: accountant.id, companyId })
      .onConflictDoNothing()
      .returning({ id: accountantClients.accountantId });
    if (!row) throw new TeamError("already_linked", `${accountant.name} ya es contador de esta empresa.`);
    await tx.insert(auditLog).values({
      companyId,
      userId: user.id,
      action: "accountant.linked_by_code",
      entity: "user",
      entityId: accountant.id,
    });
  });
  return accountant;
}

export async function unlinkAccountant(companyId: string, accountantId: string) {
  const { user } = await requireCompanyAccess(companyId, "members:manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(accountantClients)
      .where(and(eq(accountantClients.companyId, companyId), eq(accountantClients.accountantId, accountantId)))
      .returning({ id: accountantClients.accountantId });
    if (!row) throw new TeamError("not_found", "Ese contador ya no estaba vinculado.");
    await tx.insert(auditLog).values({
      companyId,
      userId: user.id,
      action: "accountant.unlinked",
      entity: "user",
      entityId: accountantId,
    });
  });
}

/** Quita a un miembro del equipo. No se puede quitar al dueño. Sus facturas se conservan. */
export async function removeMember(companyId: string, memberId: string) {
  const { user } = await requireCompanyAccess(companyId, "members:manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(companyMembers)
      .where(
        and(
          eq(companyMembers.companyId, companyId),
          eq(companyMembers.userId, memberId),
          eq(companyMembers.role, "member"),
        ),
      )
      .returning({ id: companyMembers.userId });
    if (!row) throw new TeamError("not_found", "Solo se puede quitar a miembros del equipo, no al dueño.");
    await tx.insert(auditLog).values({
      companyId,
      userId: user.id,
      action: "member.removed",
      entity: "user",
      entityId: memberId,
    });
  });
}
