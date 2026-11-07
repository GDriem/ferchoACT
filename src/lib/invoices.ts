import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { db, type Db } from "@/db";
import {
  auditLog,
  companies,
  invoiceFiles,
  invoices,
  taxPeriods,
  users,
  type Invoice,
  type InvoiceStatus,
} from "@/db/schema";
import { ForbiddenError, requireCompanyAccess, requireUser } from "@/lib/auth/access";
import { getOcr } from "@/lib/ocr";
import {
  createReadUrl,
  createUploadUrl,
  deleteBlob,
  downloadBlob,
  getBlobInfo,
  MAX_UPLOAD_BYTES,
  UPLOAD_TYPES,
  type UploadContentType,
} from "@/lib/storage";
import { periodOf, type InvoiceFields } from "@/lib/validation/invoice";

export class InvoiceError extends Error {
  constructor(
    public code: "invalid_file" | "duplicate" | "period_closed" | "not_editable",
    message: string,
    public detail?: unknown,
  ) {
    super(message);
  }
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// ---------------------------------------------------------------------------
// Subida
// ---------------------------------------------------------------------------

const isUploadType = (t: string): t is UploadContentType => t in UPLOAD_TYPES;

/** Paso 1: SAS de escritura para un blob nuevo bajo <empresa>/<usuario>/. */
export async function requestUpload(input: { companyId: string; contentType: string; sizeBytes: number }) {
  const { user } = await requireCompanyAccess(input.companyId, "invoice:upload");
  if (!isUploadType(input.contentType)) {
    throw new InvoiceError("invalid_file", "Solo se aceptan fotos (JPG, PNG, WEBP) o PDF.");
  }
  if (input.sizeBytes <= 0 || input.sizeBytes > MAX_UPLOAD_BYTES) {
    throw new InvoiceError("invalid_file", "El archivo debe pesar menos de 10 MB.");
  }
  const blobName = `${input.companyId}/${user.id}/${randomUUID()}.${UPLOAD_TYPES[input.contentType]}`;
  return { blobName, uploadUrl: await createUploadUrl(blobName) };
}

/**
 * Paso 2: el navegador ya subió el archivo. Se crea la factura en
 * "processing". El OCR se lanza aparte (processInvoiceOcr) para no bloquear.
 */
export async function confirmUpload(input: { companyId: string; blobName: string }) {
  const { user } = await requireCompanyAccess(input.companyId, "invoice:upload");
  // Solo blobs emitidos para esta persona y empresa
  const prefix = `${input.companyId}/${user.id}/`;
  const ownBlob = new RegExp(`^${prefix}[0-9a-f-]{36}\\.(jpg|png|webp|pdf)$`);
  if (!ownBlob.test(input.blobName)) {
    throw new InvoiceError("invalid_file", "No se encontró el archivo subido. Intente de nuevo.");
  }
  const info = await getBlobInfo(input.blobName);
  if (!info || info.sizeBytes === 0) {
    throw new InvoiceError("invalid_file", "No se encontró el archivo subido. Intente de nuevo.");
  }
  if (info.sizeBytes > MAX_UPLOAD_BYTES || !isUploadType(info.contentType)) {
    await deleteBlob(input.blobName);
    throw new InvoiceError("invalid_file", "El archivo no es una foto o PDF válido.");
  }

  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .insert(invoices)
      .values({ companyId: input.companyId, uploadedBy: user.id, status: "processing" })
      .returning({ id: invoices.id });
    await tx.insert(invoiceFiles).values({
      invoiceId: invoice.id,
      blobName: input.blobName,
      contentType: info.contentType,
      sizeBytes: info.sizeBytes,
    });
    await tx.insert(auditLog).values({
      companyId: input.companyId,
      userId: user.id,
      action: "invoice.uploaded",
      entity: "invoice",
      entityId: invoice.id,
    });
    return invoice.id;
  });
}

/**
 * Corre el OCR y deja la factura en needs_review. Nunca lanza: si el OCR
 * falla, la factura queda con los campos vacíos y el error guardado.
 * Se llama con after(), sin sesión: no expone datos a nadie.
 */
export async function processInvoiceOcr(invoiceId: string) {
  const [row] = await db
    .select({ invoice: invoices, blobName: invoiceFiles.blobName, contentType: invoiceFiles.contentType })
    .from(invoices)
    .innerJoin(invoiceFiles, eq(invoiceFiles.invoiceId, invoices.id))
    .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "processing")));
  if (!row) return;

  try {
    const data = await downloadBlob(row.blobName);
    const { fields, confidences, raw } = await getOcr().extractInvoice({ data, contentType: row.contentType });

    // Los textos se copian a columnas como borrador (el formulario los valida);
    // los montos quedan solo en ocr_fields hasta que la persona los confirme.
    // Si ya existe la misma factura, el número no se copia (lo bloquea el
    // índice único) y la confirmación avisa.
    const columns: Partial<Invoice> = {};
    if (fields.razonSocialEmisor) columns.razonSocialEmisor = fields.razonSocialEmisor;
    if (fields.cai) columns.cai = fields.cai;
    if (fields.rtnEmisor) columns.rtnEmisor = fields.rtnEmisor;
    if (fields.fechaEmision) columns.fechaEmision = fields.fechaEmision;
    if (fields.fechaLimiteEmision) columns.fechaLimiteEmision = fields.fechaLimiteEmision;
    if (fields.numeroFactura && fields.rtnEmisor) {
      const dup = await findDuplicate(row.invoice.companyId, fields.rtnEmisor, fields.numeroFactura, invoiceId);
      if (!dup) columns.numeroFactura = fields.numeroFactura;
    }

    await db
      .update(invoices)
      .set({
        ...columns,
        status: "needs_review",
        ocrFields: fields,
        ocrConfidence: confidences,
        ocrRaw: raw ?? null,
        ocrError: null,
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "processing")));
  } catch (e) {
    console.error("OCR falló", invoiceId, e);
    await db
      .update(invoices)
      .set({
        status: "needs_review",
        ocrError: "No pudimos leer la factura automáticamente. Complete los datos a mano.",
        updatedAt: new Date(),
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.status, "processing")));
  }
}

// ---------------------------------------------------------------------------
// Lectura y edición
// ---------------------------------------------------------------------------

const uploaderCanEdit = (status: InvoiceStatus) =>
  status === "processing" || status === "needs_review" || status === "rejected";

/**
 * Autoriza sobre una factura. Quien la subió la ve (y la edita hasta que el
 * contador la valide); el resto necesita invoice:read_all / invoice:review.
 */
export async function requireInvoiceAccess(invoiceId: string, mode: "read" | "edit") {
  const user = await requireUser();
  const [invoice] = await db.select().from(invoices).where(eq(invoices.id, invoiceId));
  if (!invoice) throw new ForbiddenError();

  if (invoice.uploadedBy === user.id) {
    try {
      await requireCompanyAccess(invoice.companyId, "invoice:upload");
      if (mode === "read" || uploaderCanEdit(invoice.status)) return { user, invoice, as: "uploader" as const };
    } catch (e) {
      if (!(e instanceof ForbiddenError)) throw e;
    }
  }
  const access = await requireCompanyAccess(invoice.companyId, mode === "read" ? "invoice:read_all" : "invoice:review");
  if (mode === "edit" && invoice.status === "declared") {
    throw new InvoiceError("not_editable", "Esta factura ya fue declarada y no se puede modificar.");
  }
  return { user, invoice, as: access.via === "accountant" ? ("accountant" as const) : ("owner" as const) };
}

export async function findDuplicate(companyId: string, rtnEmisor: string, numeroFactura: string, excludeId: string) {
  const [dup] = await db
    .select({ id: invoices.id, createdAt: invoices.createdAt, uploadedBy: users.name, status: invoices.status })
    .from(invoices)
    .innerJoin(users, eq(invoices.uploadedBy, users.id))
    .where(
      and(
        eq(invoices.companyId, companyId),
        eq(invoices.rtnEmisor, rtnEmisor),
        eq(invoices.numeroFactura, numeroFactura),
        ne(invoices.id, excludeId),
      ),
    );
  return dup ?? null;
}

/** Datos para la pantalla de confirmación: factura, archivo (SAS de lectura) y aviso de duplicado. */
export async function getInvoiceForReview(invoiceId: string) {
  const { invoice, as } = await requireInvoiceAccess(invoiceId, "read");
  const [file] = await db.select().from(invoiceFiles).where(eq(invoiceFiles.invoiceId, invoiceId));
  const [company] = await db
    .select({ legalName: companies.legalName, rtn: companies.rtn })
    .from(companies)
    .where(eq(companies.id, invoice.companyId));

  const rtn = invoice.rtnEmisor ?? invoice.ocrFields?.rtnEmisor;
  const numero = invoice.numeroFactura ?? invoice.ocrFields?.numeroFactura;
  const duplicate = rtn && numero ? await findDuplicate(invoice.companyId, rtn, numero, invoice.id) : null;

  const canEdit =
    as === "accountant"
      ? invoice.status !== "declared"
      : as === "uploader" && uploaderCanEdit(invoice.status);

  return {
    invoice,
    company,
    file: file ? { url: await createReadUrl(file.blobName), contentType: file.contentType } : null,
    duplicate,
    canEdit,
    as,
  };
}

async function ensurePeriod(tx: Tx, companyId: string, fechaEmision: string) {
  const { year, month } = periodOf(fechaEmision);
  await tx.insert(taxPeriods).values({ companyId, year, month }).onConflictDoNothing();
  const [period] = await tx
    .select()
    .from(taxPeriods)
    .where(and(eq(taxPeriods.companyId, companyId), eq(taxPeriods.year, year), eq(taxPeriods.month, month)));
  return period;
}

export const PERIOD_CLOSED_MESSAGE = "Ese período ya fue declarado. Hable con su contador.";

/** Guarda los datos confirmados. Valida duplicados y período cerrado. */
export async function saveInvoiceFields(invoiceId: string, data: InvoiceFields) {
  const { user, invoice, as } = await requireInvoiceAccess(invoiceId, "edit");

  const dup = await findDuplicate(invoice.companyId, data.rtnEmisor, data.numeroFactura, invoice.id);
  if (dup) {
    throw new InvoiceError("duplicate", "Esta factura ya fue registrada en la empresa.", dup);
  }

  try {
    await db.transaction(async (tx) => {
      const period = await ensurePeriod(tx, invoice.companyId, data.fechaEmision);
      if (period.status === "closed") throw new InvoiceError("period_closed", PERIOD_CLOSED_MESSAGE);
      // El contador puede haber movido la factura de período: se respeta si sigue abierto
      const keepPeriod = invoice.periodId && invoice.periodId !== period.id && as === "accountant";

      // Si quien la subió corrige una rechazada, vuelve a quedar por revisar
      const status: InvoiceStatus =
        as === "uploader" || invoice.status === "processing" ? "needs_review" : invoice.status;
      await tx
        .update(invoices)
        .set({
          ...data,
          periodId: keepPeriod ? invoice.periodId : period.id,
          status,
          rejectionReason: as === "uploader" ? null : invoice.rejectionReason,
          confirmedAt: as === "uploader" ? new Date() : invoice.confirmedAt,
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, invoice.id));

      const before = Object.fromEntries(
        Object.keys(data).map((k) => [k, invoice[k as keyof Invoice] ?? null]),
      );
      const changed = Object.fromEntries(
        Object.entries(data).filter(([k, v]) => String(before[k] ?? "") !== String(v ?? "")),
      );
      await tx.insert(auditLog).values({
        companyId: invoice.companyId,
        userId: user.id,
        action: as === "uploader" ? "invoice.confirmed" : "invoice.corrected",
        entity: "invoice",
        entityId: invoice.id,
        detail: JSON.stringify({
          before: Object.fromEntries(Object.keys(changed).map((k) => [k, before[k]])),
          after: changed,
        }),
      });
    });
  } catch (e) {
    // Carrera con otra subida igual: lo atrapa el índice único
    const err = e as { code?: string; cause?: { code?: string } };
    if (err.code === "23505" || err.cause?.code === "23505") {
      throw new InvoiceError("duplicate", "Esta factura ya fue registrada en la empresa.");
    }
    throw e;
  }
}

/** Descarta una subida (p. ej. duplicada). Solo quien la subió y antes de validarse. */
export async function discardInvoice(invoiceId: string) {
  const { user, invoice, as } = await requireInvoiceAccess(invoiceId, "edit");
  if (as !== "uploader") throw new ForbiddenError();
  const [file] = await db.select().from(invoiceFiles).where(eq(invoiceFiles.invoiceId, invoiceId));
  await db.transaction(async (tx) => {
    await tx.delete(invoices).where(eq(invoices.id, invoiceId));
    await tx.insert(auditLog).values({
      companyId: invoice.companyId,
      userId: user.id,
      action: "invoice.discarded",
      entity: "invoice",
      entityId: invoiceId,
      detail: JSON.stringify({ numeroFactura: invoice.numeroFactura, rtnEmisor: invoice.rtnEmisor }),
    });
  });
  if (file) await deleteBlob(file.blobName);
  return invoice.companyId;
}

/** "Mis facturas": las que subió la persona en sesión, de todas sus empresas. */
export async function listMyInvoices() {
  const user = await requireUser();
  return db
    .select({
      id: invoices.id,
      status: invoices.status,
      rejectionReason: invoices.rejectionReason,
      razonSocialEmisor: invoices.razonSocialEmisor,
      numeroFactura: invoices.numeroFactura,
      fechaEmision: invoices.fechaEmision,
      total: invoices.total,
      confirmedAt: invoices.confirmedAt,
      createdAt: invoices.createdAt,
      companyName: companies.legalName,
      year: taxPeriods.year,
      month: taxPeriods.month,
    })
    .from(invoices)
    .innerJoin(companies, eq(invoices.companyId, companies.id))
    .leftJoin(taxPeriods, eq(invoices.periodId, taxPeriods.id))
    .where(eq(invoices.uploadedBy, user.id))
    .orderBy(desc(sql`coalesce(${invoices.fechaEmision}, ${invoices.createdAt}::date)`), desc(invoices.createdAt))
    .limit(200);
}
