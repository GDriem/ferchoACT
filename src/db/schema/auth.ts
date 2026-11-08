import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid().primaryKey().defaultRandom(),
  email: text().notNull().unique(), // siempre en minúsculas
  name: text().notNull(),
  passwordHash: text().notNull(),
  // Un contador atiende a varias empresas vía accountant_clients
  isAccountant: boolean().notNull().default(false),
  // Código que el contador comparte para que una empresa lo vincule sin enlace
  accountantCode: text().unique(),
  // Foto de perfil en Blob (privada, se lee con SAS)
  avatarBlob: text(),
  createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    // SHA-256 del token de la cookie; el token en claro nunca se guarda
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index().on(t.userId)],
);

export type User = typeof users.$inferSelect;
