import "server-only";
import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { accountantClients, companyMembers, type MemberRole } from "@/db/schema";
import { getCurrentUser, type SessionUser } from "./session";

export type CompanyPermission =
  | "invoice:upload" // subir facturas propias
  | "invoice:read_all" // ver todas las facturas de la empresa
  | "invoice:review" // editar/validar cualquier factura
  | "members:manage"
  | "period:close"; // cerrar período y generar reporte SAR

const memberPermissions: Record<MemberRole, CompanyPermission[]> = {
  member: ["invoice:upload"],
  owner: ["invoice:upload", "invoice:read_all", "members:manage"],
};

const accountantPermissions: CompanyPermission[] = [
  "invoice:read_all",
  "invoice:review",
  "period:close",
];

/** Sesión obligatoria; redirige a /ingresar si no hay. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/ingresar");
  return user;
}

export class ForbiddenError extends Error {
  constructor() {
    super("No tiene permiso para esta empresa.");
  }
}

/**
 * Punto único de autorización por empresa. Toda lectura/escritura de datos
 * de una empresa debe pasar por aquí antes de tocar la base.
 */
export async function requireCompanyAccess(companyId: string, permission: CompanyPermission) {
  const user = await requireUser();

  const [membership] = await db
    .select({ role: companyMembers.role })
    .from(companyMembers)
    .where(and(eq(companyMembers.companyId, companyId), eq(companyMembers.userId, user.id)));
  if (membership && memberPermissions[membership.role].includes(permission)) {
    return { user, via: membership.role };
  }

  if (user.isAccountant && accountantPermissions.includes(permission)) {
    const [link] = await db
      .select({ companyId: accountantClients.companyId })
      .from(accountantClients)
      .where(
        and(
          eq(accountantClients.companyId, companyId),
          eq(accountantClients.accountantId, user.id),
        ),
      );
    if (link) return { user, via: "accountant" as const };
  }

  throw new ForbiddenError();
}
