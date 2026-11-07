import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountantClients } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/access";
import { createCompany, createUser, loginAs } from "../../test/helpers";
import { addCategory, deleteCategory, isCategoryAllowed, listCategories } from "./categories";

vi.mock("@/lib/auth/session", () => import("../../test/session-mock"));

describe("categorías de compras", () => {
  it("toda empresa ve la lista base; las propias solo en su empresa", async () => {
    const a = await createCompany();
    const b = await createCompany();
    loginAs(a.owner);
    const id = await addCategory(a.company.id, "  Repuestos   de moto ");
    const listA = await listCategories(a.company.id);
    expect(listA.some((c) => c.name === "Combustible" && !c.custom)).toBe(true);
    expect(listA.find((c) => c.id === id)).toMatchObject({ name: "Repuestos de moto", custom: true });

    loginAs(b.owner);
    expect((await listCategories(b.company.id)).some((c) => c.id === id)).toBe(false);
    expect(await isCategoryAllowed(b.company.id, id)).toBe(false);
    expect(await isCategoryAllowed(a.company.id, id)).toBe(true);
  });

  it("no se repiten nombres, ni de la lista base", async () => {
    const { company, owner } = await createCompany();
    loginAs(owner);
    await addCategory(company.id, "Viáticos");
    await expect(addCategory(company.id, "Viáticos")).rejects.toMatchObject({ code: "duplicate" });
    await expect(addCategory(company.id, "Combustible")).rejects.toMatchObject({ code: "duplicate" });
  });

  it("el contador también administra; un member no", async () => {
    const { company, member } = await createCompany();
    const accountant = await createUser({ isAccountant: true });
    await db.insert(accountantClients).values({ accountantId: accountant.id, companyId: company.id });

    loginAs(member);
    await expect(addCategory(company.id, "Algo")).rejects.toBeInstanceOf(ForbiddenError);
    loginAs(accountant);
    const id = await addCategory(company.id, "Algo");
    await deleteCategory(company.id, id);
    expect((await listCategories(company.id)).some((c) => c.id === id)).toBe(false);
  });

  it("las categorías de la lista base no se pueden borrar", async () => {
    const { company, owner } = await createCompany();
    loginAs(owner);
    const base = (await listCategories(company.id)).find((c) => !c.custom)!;
    await expect(deleteCategory(company.id, base.id)).rejects.toMatchObject({ code: "not_found" });
  });
});
