import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { companies, companyMembers, users } from "@/db/schema";

export { loginAs } from "./session-mock";

export async function createUser(opts: { isAccountant?: boolean; name?: string } = {}) {
  const [user] = await db
    .insert(users)
    .values({
      email: `${randomUUID()}@test.hn`,
      name: opts.name ?? "Usuario de prueba",
      passwordHash: "x",
      isAccountant: opts.isAccountant ?? false,
    })
    .returning({ id: users.id, email: users.email, name: users.name, isAccountant: users.isAccountant });
  return user;
}

/** Empresa con su owner y un member. */
export async function createCompany() {
  const owner = await createUser({ name: "Dueña" });
  const member = await createUser({ name: "Miembro" });
  const rtn = String(Math.floor(Math.random() * 1e14)).padStart(14, "0");
  const [company] = await db
    .insert(companies)
    .values({ rtn, legalName: `Empresa ${rtn}`, createdBy: owner.id })
    .returning();
  await db.insert(companyMembers).values([
    { companyId: company.id, userId: owner.id, role: "owner" },
    { companyId: company.id, userId: member.id, role: "member" },
  ]);
  return { company, owner, member };
}
