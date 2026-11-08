import "server-only";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, expenseCategories } from "@/db/schema";
import { requireCompanyAccess } from "@/lib/auth/access";

export class CategoryError extends Error {
  constructor(
    public code: "invalid" | "duplicate" | "not_found",
    message: string,
  ) {
    super(message);
  }
}

/** Condición: categoría de la lista base o propia de la empresa. */
export const categoryOfCompany = (companyId: string) =>
  or(isNull(expenseCategories.companyId), eq(expenseCategories.companyId, companyId));

/** Categorías que la empresa puede usar: primero las propias, luego la lista base. */
export async function listCategories(companyId: string) {
  await requireCompanyAccess(companyId, "company:read");
  return listCategoriesUnchecked(companyId);
}

/** Sin autorización: solo para quien ya verificó el acceso a la empresa. */
export async function listCategoriesUnchecked(companyId: string) {
  const rows = await db
    .select({ id: expenseCategories.id, name: expenseCategories.name, companyId: expenseCategories.companyId })
    .from(expenseCategories)
    .where(categoryOfCompany(companyId))
    .orderBy(asc(expenseCategories.name));
  return rows.map((r) => ({ id: r.id, name: r.name, custom: r.companyId !== null }));
}

export type CategoryOption = Awaited<ReturnType<typeof listCategoriesUnchecked>>[number];

/** true si la categoría existe y la empresa puede usarla. */
export async function isCategoryAllowed(companyId: string, categoryId: string) {
  const [row] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(and(eq(expenseCategories.id, categoryId), categoryOfCompany(companyId)));
  return !!row;
}

export async function addCategory(companyId: string, rawName: string) {
  const { user } = await requireCompanyAccess(companyId, "categories:manage");
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) {
    throw new CategoryError("invalid", "Escriba un nombre de 2 a 80 caracteres.");
  }
  // Tampoco se permite repetir una de la lista base
  const [existing] = await db
    .select({ id: expenseCategories.id })
    .from(expenseCategories)
    .where(and(categoryOfCompany(companyId), eq(expenseCategories.name, name)));
  if (existing) throw new CategoryError("duplicate", "Esa categoría ya existe.");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(expenseCategories)
      .values({ companyId, name, createdBy: user.id })
      .onConflictDoNothing()
      .returning({ id: expenseCategories.id });
    if (!row) throw new CategoryError("duplicate", "Esa categoría ya existe.");
    await tx.insert(auditLog).values({
      companyId,
      userId: user.id,
      action: "category.created",
      entity: "expense_category",
      entityId: row.id,
      detail: JSON.stringify({ name }),
    });
    return row.id;
  });
}

/** Borra una categoría propia. Las facturas que la usaban quedan sin categoría. */
export async function deleteCategory(companyId: string, categoryId: string) {
  const { user } = await requireCompanyAccess(companyId, "categories:manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(expenseCategories)
      .where(and(eq(expenseCategories.id, categoryId), eq(expenseCategories.companyId, companyId)))
      .returning({ id: expenseCategories.id, name: expenseCategories.name });
    if (!row) throw new CategoryError("not_found", "Solo se pueden quitar las categorías propias de la empresa.");
    await tx.insert(auditLog).values({
      companyId,
      userId: user.id,
      action: "category.deleted",
      entity: "expense_category",
      entityId: row.id,
      detail: JSON.stringify({ name: row.name }),
    });
  });
}
