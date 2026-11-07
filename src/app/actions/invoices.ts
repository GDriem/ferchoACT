"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/access";
import { fail, type ActionResult } from "@/lib/action-result";
import { formatDate } from "@/lib/format";
import {
  confirmUpload as confirm,
  createManualInvoice as createManual,
  discardInvoice as discard,
  InvoiceError,
  processInvoiceOcr,
  requestUpload as request,
  saveInvoiceFields,
} from "@/lib/invoices";
import { invoiceFieldsSchema } from "@/lib/validation/invoice";
import type { FormState } from "@/lib/validation/auth";

const FORBIDDEN = "No tiene permiso para esta factura.";

function toResult(e: unknown) {
  if (e instanceof InvoiceError) return fail(e.code, e.message);
  if (e instanceof ForbiddenError) return fail("forbidden", FORBIDDEN);
  throw e;
}

export async function requestUpload(input: {
  companyId: string;
  contentType: string;
  sizeBytes: number;
}): Promise<ActionResult<{ blobName: string; uploadUrl: string }>> {
  const parsed = z
    .object({ companyId: z.guid(), contentType: z.string(), sizeBytes: z.number().int() })
    .safeParse(input);
  if (!parsed.success) return fail("invalid", "Datos de subida inválidos.");
  try {
    return { ok: true, data: await request(parsed.data) };
  } catch (e) {
    return toResult(e);
  }
}

/** Crea la factura y lanza el OCR después de responder. */
const kindSchema = z.enum(["purchase", "sale"]);

export async function confirmUpload(input: {
  companyId: string;
  blobName: string;
  kind: "purchase" | "sale";
}): Promise<ActionResult<{ invoiceId: string }>> {
  const parsed = z.object({ companyId: z.guid(), blobName: z.string().max(200), kind: kindSchema }).safeParse(input);
  if (!parsed.success) return fail("invalid", "Datos de subida inválidos.");
  try {
    const invoiceId = await confirm(parsed.data);
    after(() => processInvoiceOcr(invoiceId));
    return { ok: true, data: { invoiceId } };
  } catch (e) {
    return toResult(e);
  }
}

/** Factura sin foto: se crea y se abre el formulario para llenarla a mano. */
export async function createManualInvoice(input: {
  companyId: string;
  kind: "purchase" | "sale";
}): Promise<ActionResult<{ invoiceId: string }>> {
  const parsed = z.object({ companyId: z.guid(), kind: kindSchema }).safeParse(input);
  if (!parsed.success) return fail("invalid", "Elija la empresa.");
  try {
    return { ok: true, data: { invoiceId: await createManual(parsed.data) } };
  } catch (e) {
    return toResult(e);
  }
}

export type SaveInvoiceState =
  | (NonNullable<FormState> & { saved?: boolean; duplicate?: { id: string; createdAt: string; uploadedBy: string } })
  | undefined;

export async function saveInvoice(_prev: SaveInvoiceState, formData: FormData): Promise<SaveInvoiceState> {
  const invoiceId = z.guid().safeParse(formData.get("invoiceId"));
  if (!invoiceId.success) return { message: "Factura no encontrada." };

  const parsed = invoiceFieldsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return {
      message: "Revise los campos marcados.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  try {
    await saveInvoiceFields(invoiceId.data, parsed.data);
  } catch (e) {
    if (e instanceof InvoiceError && e.code === "duplicate") {
      const d = e.detail as { id: string; createdAt: Date; uploadedBy: string } | undefined;
      return {
        message: d
          ? `Esta factura ya fue registrada el ${formatDate(d.createdAt)} por ${d.uploadedBy}.`
          : e.message,
        duplicate: d && { id: d.id, createdAt: d.createdAt.toISOString(), uploadedBy: d.uploadedBy },
      };
    }
    if (e instanceof InvoiceError) return { message: e.message };
    if (e instanceof ForbiddenError) return { message: FORBIDDEN };
    throw e;
  }
  refresh();
  return { saved: true };
}

export async function discardInvoice(invoiceId: string) {
  if (!z.guid().safeParse(invoiceId).success) return;
  try {
    await discard(invoiceId);
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof InvoiceError) return;
    throw e;
  }
  redirect("/app/facturas");
}
