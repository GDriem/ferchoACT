import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountantClients, companyMembers, users } from "@/db/schema";
import { ForbiddenError, requireCompanyAccess } from "@/lib/auth/access";
import { createCompany, createUser, loginAs } from "../../test/helpers";
import {
  becomeAccountant,
  ensureAccountantCode,
  generateAccountantCode,
  linkAccountantByCode,
  normalizeAccountantCode,
  previewAccountantByCode,
  removeMember,
  unlinkAccountant,
} from "./team";

vi.mock("@/lib/auth/session", () => import("../../test/session-mock"));

async function accountantWithCode() {
  const accountant = await createUser({ isAccountant: true, name: "Contador Pérez" });
  const code = await ensureAccountantCode(accountant.id);
  return { accountant, code };
}

describe("código de contador", () => {
  it("genera códigos legibles y los normaliza", () => {
    const code = generateAccountantCode();
    expect(code).toMatch(/^[A-HJ-KM-NP-Z2-9]{4}-[A-HJ-KM-NP-Z2-9]{4}$/);
    expect(normalizeAccountantCode(code.toLowerCase().replace("-", " "))).toBe(code);
    expect(normalizeAccountantCode("ABCD-123")).toBeNull();
    expect(normalizeAccountantCode("ABCD-1234")).toBeNull(); // el 1 no está en el alfabeto
  });

  it("varias llamadas a la vez devuelven el mismo código", async () => {
    const user = await createUser({ isAccountant: true });
    const codes = await Promise.all(Array.from({ length: 5 }, () => ensureAccountantCode(user.id)));
    expect(new Set(codes).size).toBe(1);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.accountantCode).toBe(codes[0]);
  });

  it("el código es estable y «soy contador» lo activa", async () => {
    const user = await createUser();
    loginAs(user);
    const code = await becomeAccountant();
    expect(await ensureAccountantCode(user.id)).toBe(code);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row.isAccountant).toBe(true);
  });

  it("el owner ve a quién pertenece el código y lo vincula; el contador obtiene acceso", async () => {
    const { company, owner } = await createCompany();
    const { accountant, code } = await accountantWithCode();
    loginAs(owner);
    await expect(previewAccountantByCode(company.id, code.toLowerCase())).resolves.toMatchObject({
      name: "Contador Pérez",
    });
    await linkAccountantByCode(company.id, code);
    await expect(previewAccountantByCode(company.id, code)).rejects.toMatchObject({ code: "already_linked" });
    await expect(linkAccountantByCode(company.id, code)).rejects.toMatchObject({ code: "already_linked" });

    loginAs(accountant);
    await expect(requireCompanyAccess(company.id, "invoice:review")).resolves.toMatchObject({ via: "accountant" });
  });

  it("un member no puede vincular contadores, ni con un código válido", async () => {
    const { company, member } = await createCompany();
    const { code } = await accountantWithCode();
    loginAs(member);
    await expect(previewAccountantByCode(company.id, code)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(linkAccountantByCode(company.id, code)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("un código que no existe o de alguien que no es contador no vincula", async () => {
    const { company, owner } = await createCompany();
    const notAccountant = await createUser();
    const code = await ensureAccountantCode(notAccountant.id);
    loginAs(owner);
    await expect(linkAccountantByCode(company.id, code)).rejects.toMatchObject({ code: "not_found" });
    await expect(linkAccountantByCode(company.id, "ZZZZ-ZZZZ")).rejects.toMatchObject({ code: "not_found" });
    await expect(linkAccountantByCode(company.id, "nada")).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("gestión del equipo", () => {
  it("el owner desvincula al contador y este pierde el acceso", async () => {
    const { company, owner } = await createCompany();
    const { accountant, code } = await accountantWithCode();
    loginAs(owner);
    await linkAccountantByCode(company.id, code);
    await unlinkAccountant(company.id, accountant.id);
    loginAs(accountant);
    await expect(requireCompanyAccess(company.id, "invoice:review")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("el owner quita a un member pero no al dueño; un member no quita a nadie", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(member);
    await expect(removeMember(company.id, owner.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(unlinkAccountant(company.id, owner.id)).rejects.toBeInstanceOf(ForbiddenError);

    loginAs(owner);
    await expect(removeMember(company.id, owner.id)).rejects.toMatchObject({ code: "not_found" });
    await removeMember(company.id, member.id);
    const rows = await db
      .select()
      .from(companyMembers)
      .where(and(eq(companyMembers.companyId, company.id), eq(companyMembers.userId, member.id)));
    expect(rows).toHaveLength(0);
    const links = await db.select().from(accountantClients).where(eq(accountantClients.companyId, company.id));
    expect(links).toHaveLength(0);
  });
});
