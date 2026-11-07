import {
  index,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const companies = pgTable("companies", {
  id: uuid().primaryKey().defaultRandom(),
  rtn: text().notNull().unique(), // 14 dígitos sin guiones
  legalName: text().notNull(),
  tradeName: text(),
  createdBy: uuid()
    .notNull()
    .references(() => users.id),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const memberRole = pgEnum("member_role", ["owner", "member"]);

export const companyMembers = pgTable(
  "company_members",
  {
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: memberRole().notNull().default("member"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.companyId, t.userId] }), index().on(t.userId)],
);

export const accountantClients = pgTable(
  "accountant_clients",
  {
    accountantId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountantId, t.companyId] }), index().on(t.companyId)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid().references(() => companies.id, { onDelete: "set null" }),
    userId: uuid().references(() => users.id, { onDelete: "set null" }),
    action: text().notNull(), // p. ej. "invoice.period_changed"
    entity: text().notNull(),
    entityId: text(),
    detail: text(), // JSON con antes/después y motivo
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.companyId, t.createdAt)],
);

export type Company = typeof companies.$inferSelect;
export type MemberRole = (typeof memberRole.enumValues)[number];
