import { index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { companies } from "./companies";

export const invitationKind = pgEnum("invitation_kind", ["member", "accountant"]);

export const companyInvitations = pgTable(
  "company_invitations",
  {
    id: uuid().primaryKey().defaultRandom(),
    companyId: uuid()
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    kind: invitationKind().notNull(),
    // Opcional: si se indica, solo esa cuenta puede aceptar
    email: text(),
    // SHA-256 del token del enlace; el token en claro solo se muestra al crearla
    tokenHash: text().notNull().unique(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    acceptedAt: timestamp({ withTimezone: true }),
    acceptedBy: uuid().references(() => users.id, { onDelete: "set null" }),
    revokedAt: timestamp({ withTimezone: true }),
    createdBy: uuid()
      .notNull()
      .references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.companyId)],
);

export type CompanyInvitation = typeof companyInvitations.$inferSelect;
export type InvitationKind = (typeof invitationKind.enumValues)[number];
