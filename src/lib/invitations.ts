import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  accountantClients,
  auditLog,
  companies,
  companyInvitations,
  companyMembers,
  users,
  type InvitationKind,
} from "@/db/schema";
import { requireCompanyAccess, requireUser } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";
import { invitationMailer } from "@/lib/mail";
import { createReadUrl } from "@/lib/storage";

export const INVITATION_DAYS = 7;

export function hashInvitationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export class InvitationError extends Error {
  constructor(
    public code: "invalid" | "email_mismatch" | "already_member",
    message: string,
  ) {
    super(message);
  }
}

/** Crea una invitación de un solo uso. Solo el owner (members:manage). */
export async function createInvitation(input: {
  companyId: string;
  kind: InvitationKind;
  email?: string;
  baseUrl: string;
}) {
  const { user } = await requireCompanyAccess(input.companyId, "members:manage");

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(companyInvitations)
      .values({
        companyId: input.companyId,
        kind: input.kind,
        email: input.email ?? null,
        tokenHash: hashInvitationToken(token),
        expiresAt,
        createdBy: user.id,
      })
      .returning({ id: companyInvitations.id });
    await tx.insert(auditLog).values({
      companyId: input.companyId,
      userId: user.id,
      action: "invitation.created",
      entity: "company_invitation",
      entityId: row.id,
      detail: JSON.stringify({ kind: input.kind, email: input.email ?? null }),
    });
    return row;
  });

  const url = new URL(`/invitacion/${token}`, input.baseUrl).toString();
  let delivered = false;
  if (input.email) {
    const [company] = await db
      .select({ legalName: companies.legalName })
      .from(companies)
      .where(eq(companies.id, input.companyId));
    ({ delivered } = await invitationMailer.send({
      to: input.email,
      companyName: company.legalName,
      inviterName: user.name,
      kind: input.kind,
      url,
    }));
  }

  return { id: invitation.id, url, expiresAt, delivered };
}

export async function revokeInvitation(companyId: string, invitationId: string) {
  const { user } = await requireCompanyAccess(companyId, "members:manage");
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(companyInvitations)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(companyInvitations.id, invitationId),
          eq(companyInvitations.companyId, companyId),
          isNull(companyInvitations.acceptedAt),
          isNull(companyInvitations.revokedAt),
        ),
      )
      .returning({ id: companyInvitations.id });
    if (!row) return;
    await tx.insert(auditLog).values({
      companyId,
      userId: user.id,
      action: "invitation.revoked",
      entity: "company_invitation",
      entityId: row.id,
    });
  });
}

/** Datos públicos de una invitación vigente, o null si no sirve. */
export async function findValidInvitation(token: string) {
  const [row] = await db
    .select({
      id: companyInvitations.id,
      kind: companyInvitations.kind,
      email: companyInvitations.email,
      companyId: companies.id,
      companyName: companies.legalName,
    })
    .from(companyInvitations)
    .innerJoin(companies, eq(companyInvitations.companyId, companies.id))
    .where(validTokenCondition(token));
  return row ?? null;
}

function validTokenCondition(token: string) {
  return and(
    eq(companyInvitations.tokenHash, hashInvitationToken(token)),
    isNull(companyInvitations.acceptedAt),
    isNull(companyInvitations.revokedAt),
    isNull(companyInvitations.declinedAt),
    gt(companyInvitations.expiresAt, sql`now()`),
  );
}

/**
 * Rechaza la invitación. No hace falta tener cuenta; si la invitación es
 * para un correo, solo esa cuenta puede rechazarla (para que nadie más
 * anule el enlace).
 */
export async function declineInvitation(token: string) {
  const user = await getCurrentUser();
  await db.transaction(async (tx) => {
    const [invitation] = await tx
      .select({ id: companyInvitations.id, companyId: companyInvitations.companyId, email: companyInvitations.email })
      .from(companyInvitations)
      .where(validTokenCondition(token))
      .for("update");
    if (!invitation) {
      throw new InvitationError("invalid", "Esta invitación venció, fue anulada o ya se usó.");
    }
    if (invitation.email && invitation.email !== user?.email) {
      throw new InvitationError(
        "email_mismatch",
        `Esta invitación es para ${invitation.email}. Ingrese con esa cuenta para rechazarla.`,
      );
    }
    await tx
      .update(companyInvitations)
      .set({ declinedAt: new Date() })
      .where(eq(companyInvitations.id, invitation.id));
    await tx.insert(auditLog).values({
      companyId: invitation.companyId,
      userId: user?.id ?? null,
      action: "invitation.declined",
      entity: "company_invitation",
      entityId: invitation.id,
    });
  });
}

/**
 * Acepta la invitación con la sesión actual. El token se consume de forma
 * atómica: si dos personas usan el mismo enlace, solo una lo logra.
 */
export async function acceptInvitation(token: string) {
  const user = await requireUser();

  return db.transaction(async (tx) => {
    const [invitation] = await tx
      .select({
        id: companyInvitations.id,
        companyId: companyInvitations.companyId,
        kind: companyInvitations.kind,
        email: companyInvitations.email,
      })
      .from(companyInvitations)
      .where(validTokenCondition(token))
      .for("update");
    if (!invitation) {
      throw new InvitationError("invalid", "Esta invitación venció, fue anulada o ya se usó.");
    }
    if (invitation.email && invitation.email !== user.email) {
      throw new InvitationError(
        "email_mismatch",
        `Esta invitación es para ${invitation.email}. Ingrese con esa cuenta.`,
      );
    }

    if (invitation.kind === "member") {
      const [inserted] = await tx
        .insert(companyMembers)
        .values({ companyId: invitation.companyId, userId: user.id, role: "member" })
        .onConflictDoNothing()
        .returning({ userId: companyMembers.userId });
      if (!inserted) {
        throw new InvitationError("already_member", "Usted ya pertenece a esta empresa.");
      }
    } else {
      await tx
        .insert(accountantClients)
        .values({ accountantId: user.id, companyId: invitation.companyId })
        .onConflictDoNothing();
      if (!user.isAccountant) {
        await tx.update(users).set({ isAccountant: true }).where(eq(users.id, user.id));
      }
    }

    await tx
      .update(companyInvitations)
      .set({ acceptedAt: new Date(), acceptedBy: user.id })
      .where(eq(companyInvitations.id, invitation.id));
    await tx.insert(auditLog).values({
      companyId: invitation.companyId,
      userId: user.id,
      action: invitation.kind === "member" ? "member.joined" : "accountant.linked",
      entity: "company_invitation",
      entityId: invitation.id,
    });

    return { companyId: invitation.companyId, kind: invitation.kind };
  });
}

/** Ficha de la empresa: equipo, contadores y (solo para el owner) invitaciones pendientes. */
export async function getCompanyDetail(companyId: string) {
  const access = await requireCompanyAccess(companyId, "company:read");
  const canManage = access.via === "owner";

  const [company] = await db.select().from(companies).where(eq(companies.id, companyId));

  const members = await db
    .select({ id: users.id, name: users.name, email: users.email, role: companyMembers.role })
    .from(companyMembers)
    .innerJoin(users, eq(companyMembers.userId, users.id))
    .where(eq(companyMembers.companyId, companyId))
    .orderBy(desc(companyMembers.role), users.name);

  const accountants = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(accountantClients)
    .innerJoin(users, eq(accountantClients.accountantId, users.id))
    .where(eq(accountantClients.companyId, companyId))
    .orderBy(users.name);

  const pending = canManage
    ? await db
        .select({
          id: companyInvitations.id,
          kind: companyInvitations.kind,
          email: companyInvitations.email,
          expiresAt: companyInvitations.expiresAt,
          createdAt: companyInvitations.createdAt,
        })
        .from(companyInvitations)
        .where(
          and(
            eq(companyInvitations.companyId, companyId),
            isNull(companyInvitations.acceptedAt),
            isNull(companyInvitations.revokedAt),
            isNull(companyInvitations.declinedAt),
            gt(companyInvitations.expiresAt, sql`now()`),
          ),
        )
        .orderBy(desc(companyInvitations.createdAt))
    : [];

  const logoUrl = company.logoBlob ? await createReadUrl(company.logoBlob) : null;
  return { company, logoUrl, members, accountants, pending, canManage, via: access.via, userId: access.user.id };
}
