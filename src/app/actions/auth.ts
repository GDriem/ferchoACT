"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, deleteSession } from "@/lib/auth/session";
import { loginSchema, signupSchema, type FormState } from "@/lib/validation/auth";

export async function signup(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { name, email, password } = parsed.data;
  const isAccountant = formData.get("isAccountant") === "on";

  const [created] = await db
    .insert(users)
    .values({ name, email, passwordHash: await hashPassword(password), isAccountant })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  if (!created) {
    return { fieldErrors: { email: ["Ya existe una cuenta con este correo. Ingrese en su lugar."] } };
  }

  await createSession(created.id);
  redirect(isAccountant ? "/app" : "/app/empresas/nueva");
}

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { email, password } = parsed.data;

  const [user] = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.email, email));
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    return { message: "Correo o contraseña incorrectos." };
  }

  await createSession(user.id);
  redirect("/app");
}

export async function logout() {
  await deleteSession();
  redirect("/ingresar");
}
