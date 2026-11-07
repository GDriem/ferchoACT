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
  blobName: text().notNull(),
  contentType: text().notNull(),
  sizeBytes: integer().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

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
export type InvoiceStatus = (typeof invoiceStatus.enumValues)[number];
