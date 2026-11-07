"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { auditLog, companies, companyMembers } from "@/db/schema";
import { requireUser } from "@/lib/auth/access";
import { companySchema, type FormState } from "@/lib/validation/auth";

export async function createCompany(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = companySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }

  const companyId = await db.transaction(async (tx) => {
    const [company] = await tx
      .insert(companies)
      .values({ ...parsed.data, createdBy: user.id })
      .onConflictDoNothing({ target: companies.rtn })
      .returning({ id: companies.id });
    if (!company) return null;

    await tx.insert(companyMembers).values({ companyId: company.id, userId: user.id, role: "owner" });
    await tx.insert(auditLog).values({
      companyId: company.id,
      userId: user.id,
      action: "company.created",
      entity: "company",
      entityId: company.id,
    });
    return company.id;
  });

  if (!companyId) {
    return {
      fieldErrors: {
        rtn: ["Esta empresa ya está registrada. Pida a quien la registró que lo invite."],
      },
    };
  }
  redirect("/app");
}
