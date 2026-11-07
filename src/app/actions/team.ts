"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action-result";
import { ForbiddenError } from "@/lib/auth/access";
import { CategoryError, addCategory as addCat, deleteCategory as deleteCat } from "@/lib/categories";
import {
  becomeAccountant as become,
  linkAccountantByCode,
  previewAccountantByCode,
  removeMember as remove,
  TeamError,
  unlinkAccountant as unlink,
} from "@/lib/team";

const NOT_OWNER = "Solo el dueño de la empresa puede hacer esto.";

async function run<T>(fn: () => Promise<T>, forbidden = NOT_OWNER): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof TeamError || e instanceof CategoryError) return fail(e.code, e.message);
    if (e instanceof ForbiddenError) return fail("forbidden", forbidden);
    throw e;
  }
}

const codeInput = z.object({ companyId: z.guid(), code: z.string().max(20) });

/** Muestra a quién pertenece el código antes de vincularlo. */
export async function previewAccountant(input: { companyId: string; code: string }) {
  const p = codeInput.safeParse(input);
  if (!p.success) return fail("invalid", "Escriba el código de su contador.");
  try {
    const a = await previewAccountantByCode(p.data.companyId, p.data.code);
    return { ok: true as const, data: { name: a.name, email: a.email } };
  } catch (e) {
    if (e instanceof TeamError) return fail(e.code, e.message);
    if (e instanceof ForbiddenError) return fail("forbidden", NOT_OWNER);
    throw e;
  }
}

export async function linkAccountant(input: { companyId: string; code: string }) {
  const p = codeInput.safeParse(input);
  if (!p.success) return fail("invalid", "Escriba el código de su contador.");
  return run(async () => {
    const a = await linkAccountantByCode(p.data.companyId, p.data.code);
    return { name: a.name };
  });
}

const pair = z.object({ companyId: z.guid(), userId: z.guid() });

export async function unlinkAccountant(input: { companyId: string; userId: string }) {
  const p = pair.safeParse(input);
  if (!p.success) return fail("invalid", "Contador no encontrado.");
  return run(() => unlink(p.data.companyId, p.data.userId));
}

export async function removeMember(input: { companyId: string; userId: string }) {
  const p = pair.safeParse(input);
  if (!p.success) return fail("invalid", "Miembro no encontrado.");
  return run(() => remove(p.data.companyId, p.data.userId));
}

/** "Soy contador": activa el código para compartir con las empresas. */
export async function becomeAccountant() {
  return run(() => become());
}

export async function addCategory(input: { companyId: string; name: string }) {
  const p = z.object({ companyId: z.guid(), name: z.string().max(200) }).safeParse(input);
  if (!p.success) return fail("invalid", "Escriba el nombre de la categoría.");
  return run(() => addCat(p.data.companyId, p.data.name), "No tiene permiso para cambiar las categorías.");
}

export async function deleteCategory(input: { companyId: string; categoryId: string }) {
  const p = z.object({ companyId: z.guid(), categoryId: z.guid() }).safeParse(input);
  if (!p.success) return fail("invalid", "Categoría no encontrada.");
  return run(() => deleteCat(p.data.companyId, p.data.categoryId), "No tiene permiso para cambiar las categorías.");
}
