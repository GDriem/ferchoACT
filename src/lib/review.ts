import "server-only";
import { and, eq, exists, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountantClients,
  auditLog,
  companies,
  expenseCategories,
  invoiceFiles,
  invoices,
  taxPeriods,
  users,
  type InvoiceKind,
} from "@/db/schema";
import { requireCompanyAccess, requireUser } from "@/lib/auth/access";
import { TIME_ZONE } from "@/lib/format";
import { invoiceFieldsSchema, INVOICE_FIELDS } from "@/lib/validation/invoice";

export class ReviewError extends Error {
  constructor(
    public code: "invalid" | "period_closed",
    message: string,
  ) {
    super(message);
  }
}

/** "2026-10" → { year, month }, o null si no es un período válido. */
export function parsePeriodParam(value: string) {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (month < 1 || month > 12 || year < 2000 || year > 2100) return null;
  return { year, month };
}

export const periodParam = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Mes actual en Honduras como "yyyy-mm". */
export function currentPeriodParam(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: TIME_ZONE }).slice(0, 7);
}

/** Empresas que vincularon al contador en sesión ("Mis clientes"). */
export async function listClients() {
  const user = await requireUser();
  if (!user.isAccountant) return [];
  return db
    .select({ id: companies.id, legalName: companies.legalName, rtn: companies.rtn })
    .from(accountantClients)
    .innerJoin(companies, eq(accountantClients.companyId, companies.id))
    .where(eq(accountantClients.accountantId, user.id))
    .orderBy(companies.legalName);
}

/**
 * Facturas de una empresa en un mes, para la tabla del contador. Incluye las
 * que aún no tienen período (procesando o sin fecha) subidas ese mes, para
 * que no queden escondidas.
 */
export async function getPeriodInvoices(companyId: string, year: number, month: number, kind: InvoiceKind = "purchase") {
  await requireCompanyAccess(companyId, "invoice:review");

  const [period] = await db
    .select()
    .from(taxPeriods)
    .where(and(eq(taxPeriods.companyId, companyId), eq(taxPeriods.year, year), eq(taxPeriods.month, month)));

  const uploadedThisMonth = sql`to_char(${invoices.createdAt} at time zone ${TIME_ZONE}, 'YYYY-MM') = ${periodParam(year, month)}`;
  // Una factura a mano sin confirmar no tiene datos ni archivo: no se le muestra al contador
  const hasFile = exists(db.select().from(invoiceFiles).where(eq(invoiceFiles.invoiceId, invoices.id)));
  const withoutPeriod = and(isNull(invoices.periodId), uploadedThisMonth, hasFile);
  const inMonth = period ? or(eq(invoices.periodId, period.id), withoutPeriod) : withoutPeriod;
  const rows = await db
    .select({
      id: invoices.id,
      status: invoices.status,
      fechaEmision: invoices.fechaEmision,
      razonSocialEmisor: invoices.razonSocialEmisor,
      rtnEmisor: invoices.rtnEmisor,
      nombreComprador: invoices.nombreComprador,
      rtnComprador: invoices.rtnComprador,
      categoryName: expenseCategories.name,
      numeroFactura: invoices.numeroFactura,
      importeExento: invoices.importeExento,
      importeExonerado: invoices.importeExonerado,
      importeGravado15: invoices.importeGravado15,
      importeGravado18: invoices.importeGravado18,
      isv15: invoices.isv15,
      isv18: invoices.isv18,
      total: invoices.total,
      rejectionReason: invoices.rejectionReason,
      confirmedAt: invoices.confirmedAt,
      createdAt: invoices.createdAt,
      uploadedBy: users.name,
      hasPeriod: sql<boolean>`${invoices.periodId} is not null`,
    })
    .from(invoices)
    .innerJoin(users, eq(invoices.uploadedBy, users.id))
    .leftJoin(expenseCategories, eq(invoices.categoryId, expenseCategories.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.kind, kind),
        inMonth,
      ),
    )
    .orderBy(invoices.fechaEmision, invoices.createdAt);

  // Meses con facturas, para el selector
  const periods = await db
    .select({ year: taxPeriods.year, month: taxPeriods.month, status: taxPeriods.status })
    .from(taxPeriods)
    .where(eq(taxPeriods.companyId, companyId));

  // Para la pestaña que no se está viendo: cuántas hay pendientes
  const [other] = await db
    .select({ pending: sql<number>`count(*)::int` })
    .from(invoices)
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.kind, kind === "sale" ? "purchase" : "sale"),
        inArray(invoices.status, ["processing", "needs_review"]),
        inMonth,
      ),
    );

  return { period: period ?? null, rows, periods, otherPending: other?.pending ?? 0 };
}

type BatchResult = { updated: number; skipped: { id: string; reason: string }[] };

async function audit(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  companyId: string,
  userId: string,
  action: string,
  ids: string[],
  detail: (id: string) => unknown,
) {
  if (ids.length === 0) return;
  await tx.insert(auditLog).values(
    ids.map((id) => ({
      companyId,
      userId,
      action,
      entity: "invoice",
      entityId: id,
      detail: JSON.stringify(detail(id)),
    })),
  );
}

/** Facturas de la empresa entre `ids`, bloqueadas para el lote. Ignora ids de otras empresas. */
function lockInvoices(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], companyId: string, ids: string[]) {
  return tx
    .select({ invoice: invoices, periodStatus: taxPeriods.status })
    .from(invoices)
    .leftJoin(taxPeriods, eq(invoices.periodId, taxPeriods.id))
    .where(and(eq(invoices.companyId, companyId), inArray(invoices.id, ids)))
    .for("update", { of: invoices });
}

/**
 * Marca como validadas. Solo pasan las que tienen todos los datos SAR
 * correctos y están en un período abierto; el resto se informa.
 */
export async function validateInvoices(companyId: string, ids: string[]): Promise<BatchResult> {
  const { user } = await requireCompanyAccess(companyId, "invoice:review");
  if (ids.length === 0) return { updated: 0, skipped: [] };

  return db.transaction(async (tx) => {
    const rows = await lockInvoices(tx, companyId, ids);
    const skipped: BatchResult["skipped"] = [];
    const ok: string[] = [];
    for (const { invoice, periodStatus } of rows) {
      if (invoice.status === "validated") continue;
      if (invoice.status === "declared" || periodStatus === "closed") {
        skipped.push({ id: invoice.id, reason: "Ya fue declarada." });
        continue;
      }
      if (invoice.status === "processing" || !invoice.periodId) {
        skipped.push({ id: invoice.id, reason: "Todavía no tiene los datos completos." });
        continue;
      }
      const values = Object.fromEntries(INVOICE_FIELDS.map((k) => [k, invoice[k] ?? ""]));
      if (!invoiceFieldsSchema.safeParse(values).success) {
        skipped.push({ id: invoice.id, reason: "Tiene datos incompletos o que no cuadran." });
        continue;
      }
      ok.push(invoice.id);
    }
    if (ok.length) {
      await tx
        .update(invoices)
        .set({ status: "validated", rejectionReason: null, updatedAt: new Date() })
        .where(inArray(invoices.id, ok));
      await audit(tx, companyId, user.id, "invoice.validated", ok, () => ({}));
    }
    return { updated: ok.length, skipped };
  });
}

/** Rechaza con motivo; quien la subió lo ve y puede corregirla. */
export async function rejectInvoices(companyId: string, ids: string[], reason: string): Promise<BatchResult> {
  const { user } = await requireCompanyAccess(companyId, "invoice:review");
  const motivo = reason.trim();
  if (motivo.length < 3) throw new ReviewError("invalid", "Escriba el motivo del rechazo.");
  if (ids.length === 0) return { updated: 0, skipped: [] };

  return db.transaction(async (tx) => {
    const rows = await lockInvoices(tx, companyId, ids);
    const skipped: BatchResult["skipped"] = [];
    const ok: string[] = [];
    for (const { invoice, periodStatus } of rows) {
      if (invoice.status === "declared" || periodStatus === "closed") {
        skipped.push({ id: invoice.id, reason: "Ya fue declarada." });
      } else {
        ok.push(invoice.id);
      }
    }
    if (ok.length) {
      await tx
        .update(invoices)
        .set({ status: "rejected", rejectionReason: motivo, updatedAt: new Date() })
        .where(inArray(invoices.id, ok));
      await audit(tx, companyId, user.id, "invoice.rejected", ok, () => ({ reason: motivo }));
    }
    return { updated: ok.length, skipped };
  });
}

/** Reasigna el período (p. ej. factura de fin de mes declarada en el siguiente). */
export async function moveInvoicesToPeriod(
  companyId: string,
  ids: string[],
  year: number,
  month: number,
): Promise<BatchResult> {
  const { user } = await requireCompanyAccess(companyId, "invoice:review");
  if (ids.length === 0) return { updated: 0, skipped: [] };

  return db.transaction(async (tx) => {
    await tx.insert(taxPeriods).values({ companyId, year, month }).onConflictDoNothing();
    const [target] = await tx
      .select()
      .from(taxPeriods)
      .where(and(eq(taxPeriods.companyId, companyId), eq(taxPeriods.year, year), eq(taxPeriods.month, month)));
    if (target.status === "closed") {
      throw new ReviewError("period_closed", "Ese período ya fue declarado; no se le pueden agregar facturas.");
    }

    const rows = await lockInvoices(tx, companyId, ids);
    const skipped: BatchResult["skipped"] = [];
    const moved: { id: string; from: string | null }[] = [];
    for (const { invoice, periodStatus } of rows) {
      if (invoice.status === "declared" || periodStatus === "closed") {
        skipped.push({ id: invoice.id, reason: "Ya fue declarada." });
      } else if (invoice.periodId !== target.id) {
        moved.push({ id: invoice.id, from: invoice.periodId });
      }
    }
    if (moved.length) {
      await tx
        .update(invoices)
        .set({ periodId: target.id, updatedAt: new Date() })
        .where(
          and(
            inArray(
              invoices.id,
              moved.map((m) => m.id),
            ),
            ne(invoices.status, "declared"),
          ),
        );
      const fromOf = new Map(moved.map((m) => [m.id, m.from]));
      await audit(
        tx,
        companyId,
        user.id,
        "invoice.period_changed",
        moved.map((m) => m.id),
        (id) => ({ fromPeriodId: fromOf.get(id), to: periodParam(year, month) }),
      );
    }
    return { updated: moved.length, skipped };
  });
}
