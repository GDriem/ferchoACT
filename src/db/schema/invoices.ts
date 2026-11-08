import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { companies } from "./companies";

const money = () => numeric({ precision: 14, scale: 2 });

export const periodStatus = pgEnum("period_status", ["open", "closed"]);

export const taxPeriods = pgTable(
  "tax_periods",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    year: integer().notNull(),
    month: integer().notNull(), // 1-12
    status: periodStatus().notNull().default("open"),
    closedAt: timestamp({ withTimezone: true }),
    closedBy: uuid().references(() => users.id),
  },
  (t) => [unique().on(t.companyId, t.year, t.month)],
);

/**
 * Categorías de compras y gastos. Las de company_id null son la lista base
 * (para todas las empresas); cada empresa o su contador agrega las suyas.
 */
export const expenseCategories = pgTable(
  "expense_categories",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid().references(() => companies.id, { onDelete: "cascade" }),
    name: text().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique().on(t.companyId, t.name).nullsNotDistinct()],
);

/** Compra o gasto (la empresa es la compradora) o venta (la empresa la emitió). */
export const invoiceKind = pgEnum("invoice_kind", ["purchase", "sale"]);

export const invoiceStatus = pgEnum("invoice_status", [
  "processing",
  "needs_review",
  "validated",
  "declared",
  "rejected",
]);

export const invoices = pgTable(
  "invoices",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    periodId: uuid().references(() => taxPeriods.id),
    uploadedBy: uuid()
      .notNull()
      .references(() => users.id),
    kind: invoiceKind().notNull().default("purchase"),
    status: invoiceStatus().notNull().default("processing"),
    rejectionReason: text(),

    // Campos SAR (nullable hasta que el OCR/usuario los complete)
    rtnEmisor: text(),
    razonSocialEmisor: text(),
    cai: text(),
    numeroFactura: text(),
    rangoAutorizadoDesde: text(),
    rangoAutorizadoHasta: text(),
    fechaLimiteEmision: date(),
    fechaEmision: date(),
    rtnComprador: text(),
    // Cliente de una venta (en compras, el comprador es la empresa)
    nombreComprador: text(),
    // Solo compras; se pone en null si se borra la categoría
    categoryId: uuid().references(() => expenseCategories.id, { onDelete: "set null" }),

    importeExento: money().notNull().default("0"),
    importeExonerado: money().notNull().default("0"),
    importeGravado15: money().notNull().default("0"),
    importeGravado18: money().notNull().default("0"),
    isv15: money().notNull().default("0"),
    isv18: money().notNull().default("0"),
    total: money().notNull().default("0"),

    // Salida cruda del OCR y confianza por campo, para resaltar en la UI
    ocrConfidence: jsonb().$type<Record<string, number>>(),
    ocrRaw: jsonb(),
    // Valores que propuso el OCR (prellenan el formulario aunque no se guarden en columnas)
    ocrFields: jsonb().$type<Record<string, string>>(),
    // Mensaje si el OCR falló; la factura igual pasa a needs_review
    ocrError: text(),
    // Cuándo quien la subió confirmó los datos
    confirmedAt: timestamp({ withTimezone: true }),

    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("invoices_no_duplicates").on(t.companyId, t.rtnEmisor, t.numeroFactura),
    index().on(t.companyId, t.periodId),
    index().on(t.uploadedBy),
  ],
);

export const invoiceFiles = pgTable("invoice_files", {
  id: uuid().primaryKey().defaultRandom(),
  invoiceId: uuid()
    .notNull()
    .references(() => invoices.id, { onDelete: "cascade" }),
  blobName: text().notNull().unique(),
  contentType: text().notNull(),
  sizeBytes: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const invoiceComments = pgTable(
  "invoice_comments",
  {
    id: uuid().primaryKey().defaultRandom(),
    invoiceId: uuid()
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    authorId: uuid().references(() => users.id, { onDelete: "set null" }),
    body: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.invoiceId, t.createdAt)],
);

export const sarReports = pgTable("sar_reports", {
  id: uuid().primaryKey().defaultRandom(),
  periodId: uuid()
    .notNull()
    .references(() => taxPeriods.id),
  version: integer().notNull(),
  blobName: text().notNull(),
  generatedBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export type Invoice = typeof invoices.$inferSelect;
export type InvoiceKind = (typeof invoiceKind.enumValues)[number];
export type ExpenseCategory = typeof expenseCategories.$inferSelect;
export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number];
