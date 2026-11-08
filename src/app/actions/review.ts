"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/access";
import { fail, type ActionResult } from "@/lib/action-result";
import { getInvoiceForReview, InvoiceError } from "@/lib/invoices";
import { moveInvoicesToPeriod, parsePeriodParam, rejectInvoices, ReviewError, validateInvoices } from "@/lib/review";
import { initialInvoiceValues } from "@/lib/validation/invoice";

type Batch = { updated: number; skipped: { id: string; reason: string }[] };

const batchInput = z.object({ companyId: z.guid(), ids: z.array(z.guid()).min(1).max(500) });

async function run(fn: () => Promise<Batch>): Promise<ActionResult<Batch>> {
  try {
    const data = await fn();
    refresh();
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ReviewError) return fail(e.code, e.message);
    if (e instanceof ForbiddenError) return fail("forbidden", "No tiene permiso para revisar esta empresa.");
    throw e;
  }
}

export async function validateBatch(input: { companyId: string; ids: string[] }) {
  const p = batchInput.safeParse(input);
  if (!p.success) return fail("invalid", "Seleccione al menos una factura.");
  return run(() => validateInvoices(p.data.companyId, p.data.ids));
}

export async function rejectBatch(input: { companyId: string; ids: string[]; reason: string }) {
  const p = batchInput.extend({ reason: z.string().max(500) }).safeParse(input);
  if (!p.success) return fail("invalid", "Seleccione al menos una factura.");
  return run(() => rejectInvoices(p.data.companyId, p.data.ids, p.data.reason));
}

export async function moveBatch(input: { companyId: string; ids: string[]; period: string }) {
  const p = batchInput.extend({ period: z.string() }).safeParse(input);
  const target = p.success ? parsePeriodParam(p.data.period) : null;
  if (!p.success || !target) return fail("invalid", "Elija el período de destino.");
  return run(() => moveInvoicesToPeriod(p.data.companyId, p.data.ids, target.year, target.month));
}

/** Datos del panel lateral. La SAS de lectura se emite después de autorizar. */
export async function getInvoiceDetail(invoiceId: string) {
  if (!z.guid().safeParse(invoiceId).success) return fail("invalid", "Factura no encontrada.");
  try {
    const { invoice, company, file, duplicate, canEdit, categories } = await getInvoiceForReview(invoiceId);
    return {
      ok: true as const,
      data: {
        id: invoice.id,
        kind: invoice.kind,
        categories,
        status: invoice.status,
        rejectionReason: invoice.rejectionReason,
        confirmedAt: invoice.confirmedAt,
        initial: initialInvoiceValues(invoice),
        confidences: invoice.ocrConfidence,
        companyRtn: company.rtn,
        file,
        duplicate,
        canEdit,
      },
    };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof InvoiceError) return fail("forbidden", "No tiene acceso a esta factura.");
    throw e;
  }
}
