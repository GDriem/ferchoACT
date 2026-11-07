import { eq, inArray } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountantClients, auditLog, invoices, taxPeriods } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/access";
import { createCompany, createUser, loginAs } from "../../test/helpers";
import {
  currentPeriodParam,
  getPeriodInvoices,
  moveInvoicesToPeriod,
  parsePeriodParam,
  rejectInvoices,
  validateInvoices,
} from "./review";

vi.mock("@/lib/auth/session", () => import("../../test/session-mock"));

let seq = 0;
async function setup() {
  const { company, owner, member } = await createCompany();
  const accountant = await createUser({ isAccountant: true });
  await db.insert(accountantClients).values({ accountantId: accountant.id, companyId: company.id });
  const [period] = await db.insert(taxPeriods).values({ companyId: company.id, year: 2026, month: 10 }).returning();

  const make = async (over: Partial<typeof invoices.$inferInsert> = {}) => {
    const [inv] = await db
      .insert(invoices)
      .values({
        companyId: company.id,
        uploadedBy: member.id,
        periodId: period.id,
        status: "needs_review",
        rtnEmisor: "08011990123456",
        razonSocialEmisor: "Proveedor",
        cai: "3A5F1B-2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C",
        numeroFactura: `000-001-01-${String(++seq).padStart(8, "0")}`,
        fechaEmision: "2026-10-15",
        fechaLimiteEmision: "2027-03-31",
        importeGravado15: "1000",
        isv15: "150",
        total: "1150",
        ...over,
      })
      .returning();
    return inv;
  };
  return { company, owner, member, accountant, period, make };
}

const statusOf = async (ids: string[]) =>
  Object.fromEntries(
    (await db.select({ id: invoices.id, s: invoices.status }).from(invoices).where(inArray(invoices.id, ids))).map(
      (r) => [r.id, r.s],
    ),
  );

describe("revisión del contador", () => {
  it("solo el contador vinculado revisa: ni owner, ni member, ni otro contador", async () => {
    const { company, owner, member, make } = await setup();
    const inv = await make();
    for (const u of [owner, member, await createUser({ isAccountant: true })]) {
      loginAs(u);
      await expect(validateInvoices(company.id, [inv.id])).rejects.toBeInstanceOf(ForbiddenError);
      await expect(rejectInvoices(company.id, [inv.id], "motivo")).rejects.toBeInstanceOf(ForbiddenError);
      await expect(moveInvoicesToPeriod(company.id, [inv.id], 2026, 11)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(getPeriodInvoices(company.id, 2026, 10)).rejects.toBeInstanceOf(ForbiddenError);
    }
  });

  it("valida en lote las correctas e informa las que no cuadran", async () => {
    const { company, accountant, make } = await setup();
    const good = await make();
    const bad = await make({ isv15: "100" });
    loginAs(accountant);
    const r = await validateInvoices(company.id, [good.id, bad.id]);
    expect(r.updated).toBe(1);
    expect(r.skipped).toEqual([{ id: bad.id, reason: expect.stringMatching(/no cuadran/) }]);
    expect(await statusOf([good.id, bad.id])).toEqual({ [good.id]: "validated", [bad.id]: "needs_review" });
  });

  it("ignora facturas de otra empresa aunque vengan en el lote", async () => {
    const a = await setup();
    const b = await setup();
    const foreign = await b.make();
    loginAs(a.accountant);
    const r = await validateInvoices(a.company.id, [foreign.id]);
    expect(r.updated).toBe(0);
    expect(await statusOf([foreign.id])).toEqual({ [foreign.id]: "needs_review" });
  });

  it("rechaza con motivo y deja rastro en audit_log", async () => {
    const { company, accountant, make } = await setup();
    const inv = await make();
    loginAs(accountant);
    await expect(rejectInvoices(company.id, [inv.id], " ")).rejects.toMatchObject({ code: "invalid" });
    await rejectInvoices(company.id, [inv.id], "La foto está borrosa");
    const [row] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(row).toMatchObject({ status: "rejected", rejectionReason: "La foto está borrosa" });
    const [log] = await db.select().from(auditLog).where(eq(auditLog.entityId, inv.id));
    expect(log).toMatchObject({ action: "invoice.rejected", userId: accountant.id });
    expect(JSON.parse(log.detail!)).toEqual({ reason: "La foto está borrosa" });
  });

  it("mueve de período, crea el destino y registra el cambio", async () => {
    const { company, accountant, period, make } = await setup();
    const inv = await make();
    loginAs(accountant);
    expect((await moveInvoicesToPeriod(company.id, [inv.id], 2026, 11)).updated).toBe(1);

    const [row] = await db
      .select({ year: taxPeriods.year, month: taxPeriods.month })
      .from(invoices)
      .innerJoin(taxPeriods, eq(invoices.periodId, taxPeriods.id))
      .where(eq(invoices.id, inv.id));
    expect(row).toEqual({ year: 2026, month: 11 });
    const logs = await db.select().from(auditLog).where(eq(auditLog.entityId, inv.id));
    expect(JSON.parse(logs.find((l) => l.action === "invoice.period_changed")!.detail!)).toEqual({
      fromPeriodId: period.id,
      to: "2026-11",
    });
  });

  it("no toca facturas declaradas ni mueve a un período cerrado", async () => {
    const { company, accountant, make } = await setup();
    const declared = await make({ status: "declared" });
    const open = await make();
    await db.insert(taxPeriods).values({ companyId: company.id, year: 2026, month: 9, status: "closed" });
    loginAs(accountant);

    const r = await rejectInvoices(company.id, [declared.id], "error");
    expect(r).toEqual({ updated: 0, skipped: [{ id: declared.id, reason: "Ya fue declarada." }] });
    await expect(moveInvoicesToPeriod(company.id, [open.id], 2026, 9)).rejects.toMatchObject({
      code: "period_closed",
    });
  });

  it("la tabla del mes trae las del período y las aún sin período", async () => {
    const { company, accountant, make } = await setup();
    const inPeriod = await make();
    await make({ fechaEmision: "2026-11-02", periodId: null, status: "processing" });
    loginAs(accountant);
    const { rows, period } = await getPeriodInvoices(company.id, 2026, 10);
    expect(period?.month).toBe(10);
    expect(rows.map((r) => r.id)).toContain(inPeriod.id);
    // La de "processing" sin período aparece en el mes en que se subió (hoy)
    const now = parsePeriodParam(currentPeriodParam())!;
    const current = await getPeriodInvoices(company.id, now.year, now.month);
    expect(current.rows.some((r) => !r.hasPeriod)).toBe(true);
  });

  it("parsea el período de la URL", () => {
    expect(parsePeriodParam("2026-10")).toEqual({ year: 2026, month: 10 });
    expect(parsePeriodParam("2026-13")).toBeNull();
    expect(parsePeriodParam("abc")).toBeNull();
    expect(currentPeriodParam(new Date("2026-11-01T03:00:00Z"))).toBe("2026-10");
  });
});
