"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action-result";
import { ForbiddenError } from "@/lib/auth/access";
import { ProfileError, removeAvatar as removeAv, setAvatar, setCompanyLogo, updateName as update } from "@/lib/profile";
import type { FormState } from "@/lib/validation/auth";

const nameSchema = z.object({ name: z.string().trim().min(2, { error: "Escriba su nombre completo." }).max(120) });

export type NameState = (NonNullable<FormState> & { saved?: boolean }) | undefined;

export async function updateName(_prev: NameState, formData: FormData): Promise<NameState> {
  const parsed = nameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  await update(parsed.data.name);
  refresh();
  return { saved: true };
}

async function readImage(formData: FormData) {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new ProfileError("Elija una imagen.");
  return { data: new Uint8Array(await file.arrayBuffer()), contentType: file.type };
}

async function run(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
    refresh();
    return { ok: true, data: undefined };
  } catch (e) {
    if (e instanceof ProfileError) return fail("invalid", e.message);
    if (e instanceof ForbiddenError) return fail("forbidden", "Solo el dueño de la empresa puede cambiar el logo.");
    throw e;
  }
}

export async function uploadAvatar(formData: FormData) {
  return run(async () => {
    const { data, contentType } = await readImage(formData);
    await setAvatar(data, contentType);
  });
}

export async function removeAvatar() {
  return run(() => removeAv());
}

export async function uploadCompanyLogo(formData: FormData) {
  const companyId = z.guid().safeParse(formData.get("companyId"));
  if (!companyId.success) return fail("invalid", "Empresa no encontrada.");
  return run(async () => {
    const { data, contentType } = await readImage(formData);
    await setCompanyLogo(companyId.data, data, contentType);
  });
}

export async function removeCompanyLogo(companyId: string) {
  if (!z.guid().safeParse(companyId).success) return fail("invalid", "Empresa no encontrada.");
  return run(() => setCompanyLogo(companyId, null));
}
