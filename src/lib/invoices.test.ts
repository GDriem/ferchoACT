import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { auditLog, invoices, taxPeriods } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/access";
import { invoiceFieldsSchema, type InvoiceFieldsInput } from "@/lib/validation/invoice";
import { createCompany, createUser, loginAs } from "../../test/helpers";
import { addCategory, listCategories } from "@/lib/categories";
import {
  confirmUpload,
  createManualInvoice,
  discardInvoice,
  getInvoiceForReview,
  listMyInvoices,
  processInvoiceOcr,
  requestUpload,
  saveInvoiceFields,
} from "./invoices";

vi.mock("@/lib/auth/session", () => import("../../test/session-mock"));

// Blob simulado: lo "subido" vive en este Map
const blobs = vi.hoisted(() => new Map<string, { sizeBytes: number; contentType: string }>());
vi.mock("@/lib/storage", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/storage")>();
  return {
    ...original,
    createUploadUrl: async (name: string) => `http://blob.test/${name}?sas=w`,
    createReadUrl: async (name: string) => `http://blob.test/${name}?sas=r`,
    getBlobInfo: async (name: string) => blobs.get(name) ?? null,
    downloadBlob: async () => new Uint8Array([1, 2, 3]),
    deleteBlob: async (name: string) => void blobs.delete(name),
  };
});

const ocr = vi.hoisted(() => ({ fail: false }));
vi.mock("@/lib/ocr", () => ({
  getOcr: () => ({
    extractInvoice: async () => {
      if (ocr.fail) throw new Error("servicio caído");
      return {
        fields: { rtnEmisor: "08011990123456", numeroFactura: "000-001-01-00000999", cai: "X" },
        confidences: { rtnEmisor: 0.95, numeroFactura: 0.9, cai: 0.5 },
      };
    },
  }),
}));

const fields: InvoiceFieldsInput = {
  rtnEmisor: "08011990123456",
  razonSocialEmisor: "Ferretería El Martillo",
  cai: "3A5F1B-2C4D6E-8F0A1B-2C3D4E-5F6A7B-8C",
  numeroFactura: "000-001-01-00000123",
  fechaEmision: "2026-10-15",
  fechaLimiteEmision: "2027-03-31",
  importeGravado15: "1000",
  isv15: "150",
  total: "1150",
};
const parsed = (over: Partial<InvoiceFieldsInput> = {}) => invoiceFieldsSchema.parse({ ...fields, ...over });

async function upload(companyId: string) {
  const { blobName } = await requestUpload({ companyId, contentType: "image/jpeg", sizeBytes: 1000 });
  blobs.set(blobName, { sizeBytes: 1000, contentType: "image/jpeg" });
  return confirmUpload({ companyId, blobName });
}

beforeEach(() => {
  ocr.fail = false;
});

describe("subida y OCR", () => {
  it("un member sube y la factura queda en processing; el OCR la pasa a needs_review", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const id = await upload(company.id);
    const [before] = await db.select().from(invoices).where(eq(invoices.id, id));
    expect(before.status).toBe("processing");

    await processInvoiceOcr(id);
    const [after] = await db.select().from(invoices).where(eq(invoices.id, id));
    expect(after.status).toBe("needs_review");
    expect(after.rtnEmisor).toBe("08011990123456");
    expect(after.ocrConfidence?.cai).toBeLessThan(0.8);
  });

  it("si el OCR falla, la factura no se pierde", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const id = await upload(company.id);
    ocr.fail = true;
    await processInvoiceOcr(id);
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
    expect(row.status).toBe("needs_review");
    expect(row.ocrError).toMatch(/a mano/);
  });

  it("alguien ajeno no puede pedir SAS ni confirmar en otra empresa", async () => {
    const { company } = await createCompany();
    loginAs(await createUser());
    await expect(
      requestUpload({ companyId: company.id, contentType: "image/jpeg", sizeBytes: 10 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no se puede confirmar un blob emitido para otra persona", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(owner);
    const { blobName } = await requestUpload({ companyId: company.id, contentType: "image/png", sizeBytes: 10 });
    blobs.set(blobName, { sizeBytes: 10, contentType: "image/png" });
    loginAs(member);
    await expect(confirmUpload({ companyId: company.id, blobName })).rejects.toMatchObject({
      code: "invalid_file",
    });
  });

  it("rechaza tipos y tamaños no permitidos", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    await expect(
      requestUpload({ companyId: company.id, contentType: "text/html", sizeBytes: 10 }),
    ).rejects.toMatchObject({ code: "invalid_file" });
    await expect(
      requestUpload({ companyId: company.id, contentType: "image/jpeg", sizeBytes: 11 * 1024 * 1024 }),
    ).rejects.toMatchObject({ code: "invalid_file" });
  });
});

describe("confirmación", () => {
  it("guarda, asigna el período por fecha de emisión y deja rastro en audit_log", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const id = await upload(company.id);
    await processInvoiceOcr(id);
    await saveInvoiceFields(id, parsed());

    const [row] = await db
      .select({ inv: invoices, year: taxPeriods.year, month: taxPeriods.month })
      .from(invoices)
      .innerJoin(taxPeriods, eq(invoices.periodId, taxPeriods.id))
      .where(eq(invoices.id, id));
    expect(row).toMatchObject({ year: 2026, month: 10 });
    expect(row.inv.confirmedAt).not.toBeNull();
    expect(row.inv.isv15).toBe("150.00");

    const log = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(log.map((l) => l.action)).toEqual(expect.arrayContaining(["invoice.uploaded", "invoice.confirmed"]));
  });

  it("avisa si la factura está duplicada y permite descartarla", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(owner);
    const first = await upload(company.id);
    await saveInvoiceFields(first, parsed());

    loginAs(member);
    const second = await upload(company.id);
    await expect(saveInvoiceFields(second, parsed())).rejects.toMatchObject({ code: "duplicate" });

    await db.update(invoices).set({ rtnEmisor: "08011990123456", numeroFactura: null }).where(eq(invoices.id, second));
    await db.update(invoices).set({ ocrFields: { numeroFactura: "000-001-01-00000123" } }).where(eq(invoices.id, second));
    const review = await getInvoiceForReview(second);
    expect(review.duplicate?.id).toBe(first);

    await discardInvoice(second);
    expect(await db.select().from(invoices).where(eq(invoices.id, second))).toEqual([]);
  });

  it("un member no ve ni edita la factura de otro member", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(owner);
    const id = await upload(company.id);
    loginAs(member);
    await expect(getInvoiceForReview(id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(saveInvoiceFields(id, parsed())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("el owner ve las facturas del equipo pero no las edita", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(member);
    const id = await upload(company.id);
    loginAs(owner);
    await expect(getInvoiceForReview(id)).resolves.toMatchObject({ canEdit: false, as: "owner" });
    await expect(saveInvoiceFields(id, parsed())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no se puede agregar a un período cerrado", async () => {
    const { company, member } = await createCompany();
    await db.insert(taxPeriods).values({ companyId: company.id, year: 2026, month: 10, status: "closed" });
    loginAs(member);
    const id = await upload(company.id);
    await expect(saveInvoiceFields(id, parsed())).rejects.toMatchObject({ code: "period_closed" });
  });

  it("quien subió no edita una factura ya validada", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const id = await upload(company.id);
    await saveInvoiceFields(id, parsed());
    await db.update(invoices).set({ status: "validated" }).where(eq(invoices.id, id));
    await expect(saveInvoiceFields(id, parsed({ total: "1150.01" }))).rejects.toBeInstanceOf(ForbiddenError);
    await expect(discardInvoice(id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("Mis facturas solo trae las propias", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(owner);
    await upload(company.id);
    loginAs(member);
    const mine = await upload(company.id);
    expect((await listMyInvoices()).map((i) => i.id)).toEqual([mine]);
  });
});

describe("eliminar", () => {
  it("quien la subió elimina una factura sin revisar (p. ej. un PDF equivocado), con su archivo", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const id = await upload(company.id);
    const { canDelete } = await getInvoiceForReview(id);
    expect(canDelete).toBe(true);
    const [file] = [...blobs.keys()].filter((k) => k.startsWith(`${company.id}/${member.id}/`));
    await discardInvoice(id);
    expect(await db.select().from(invoices).where(eq(invoices.id, id))).toEqual([]);
    expect(blobs.has(file)).toBe(false);
    const [log] = await db.select().from(auditLog).where(eq(auditLog.entityId, id));
    expect(log).toBeDefined();
  });

  it("el owner ve la factura de un member pero no la puede eliminar", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(member);
    const id = await upload(company.id);
    loginAs(owner);
    expect((await getInvoiceForReview(id)).canDelete).toBe(false);
    await expect(discardInvoice(id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no se elimina si el contador la valida mientras tanto", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const id = await upload(company.id);
    const [file] = [...blobs.keys()].filter((k) => k.startsWith(`${company.id}/${member.id}/`));
    // El contador valida justo después del chequeo de permisos y antes del borrado
    const transaction = db.transaction.bind(db);
    vi.spyOn(db, "transaction").mockImplementationOnce(async (fn) => {
      await db.update(invoices).set({ status: "validated" }).where(eq(invoices.id, id));
      return transaction(fn);
    });
    await expect(discardInvoice(id)).rejects.toMatchObject({ code: "not_editable" });
    expect(await db.select({ id: invoices.id }).from(invoices).where(eq(invoices.id, id))).toEqual([{ id }]);
    expect(blobs.has(file)).toBe(true);
  });
});

describe("ventas", () => {
  it("en una venta la empresa siempre es la emisora, diga lo que diga el formulario", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const id = await createManualInvoice({ companyId: company.id, kind: "sale" });
    await saveInvoiceFields(id, parsed({ nombreComprador: "Cliente Final", rtnComprador: "" }));
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
    expect(row).toMatchObject({
      kind: "sale",
      rtnEmisor: company.rtn,
      razonSocialEmisor: company.legalName,
      nombreComprador: "Cliente Final",
      categoryId: null,
    });
  });

  it("una venta nueva toma el CAI y la fecha límite de la última venta", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const first = await createManualInvoice({ companyId: company.id, kind: "sale" });
    await saveInvoiceFields(first, parsed());
    const second = await createManualInvoice({ companyId: company.id, kind: "sale" });
    const [row] = await db.select().from(invoices).where(eq(invoices.id, second));
    expect(row).toMatchObject({ cai: fields.cai, fechaLimiteEmision: fields.fechaLimiteEmision, rtnEmisor: company.rtn });
  });

  it("el OCR de una venta no cambia el emisor", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    const { blobName } = await requestUpload({ companyId: company.id, contentType: "image/jpeg", sizeBytes: 1000 });
    blobs.set(blobName, { sizeBytes: 1000, contentType: "image/jpeg" });
    const id = await confirmUpload({ companyId: company.id, blobName, kind: "sale" });
    await processInvoiceOcr(id);
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
    expect(row.rtnEmisor).toBe(company.rtn);
    expect(row.numeroFactura).toBe("000-001-01-00000999");
  });
});

describe("categoría", () => {
  it("guarda una categoría de la lista base o propia, pero no la de otra empresa", async () => {
    const { company, owner, member } = await createCompany();
    const other = await createCompany();
    loginAs(other.owner);
    const foreign = await addCategory(other.company.id, "Ajena");

    loginAs(owner);
    const own = await addCategory(company.id, "Propia");
    loginAs(member);
    const base = (await listCategories(company.id)).find((c) => c.name === "Combustible")!;
    const id = await upload(company.id);
    await saveInvoiceFields(id, parsed({ categoryId: base.id }));
    await saveInvoiceFields(id, parsed({ categoryId: own }));
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
    expect(row.categoryId).toBe(own);
    await expect(saveInvoiceFields(id, parsed({ categoryId: foreign }))).rejects.toMatchObject({
      code: "invalid_category",
    });
  });
});
