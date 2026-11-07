import { z } from "zod";
import { isValidRtn, normalizeRtn } from "./rtn";

export const signupSchema = z.object({
  name: z.string().trim().min(2, { error: "Escriba su nombre completo." }),
  email: z
    .email({ error: "Escriba un correo válido." })
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(8, { error: "La contraseña debe tener al menos 8 caracteres." }),
});

export const loginSchema = z.object({
  email: z
    .email({ error: "Escriba un correo válido." })
    .transform((v) => v.trim().toLowerCase()),
  password: z.string().min(1, { error: "Escriba su contraseña." }),
});

export const companySchema = z.object({
  legalName: z.string().trim().min(2, { error: "Escriba la razón social." }),
  tradeName: z
    .string()
    .trim()
    .optional()
    .transform((v) => v || undefined),
  rtn: z
    .string()
    .refine(isValidRtn, { error: "El RTN debe tener 14 dígitos." })
    .transform(normalizeRtn),
});

/** Estado que devuelven las server actions de formularios (useActionState). */
export type FormState =
  | {
      message?: string;
      fieldErrors?: Record<string, string[] | undefined>;
    }
  | undefined;
