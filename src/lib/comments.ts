import "server-only";
import { and, asc, eq, exists, inArray, isNotNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { accountantClients, companies, companyMembers, invoiceComments, users } from "@/db/schema";
import { requireInvoiceAccess } from "@/lib/invoices";
import { commentMailer } from "@/lib/mail";

export const COMMENT_MAX = 2000;

export class CommentError extends Error {
  constructor(message: string) {
    super(message);
  }
}

/** Comentarios de una factura, del más viejo al más nuevo. Quien puede ver la factura puede verlos. */
export async function listComments(invoiceId: string) {
  await requireInvoiceAccess(invoiceId, "read");
  return db
    .select({
      id: invoiceComments.id,
      body: invoiceComments.body,
      createdAt: invoiceComments.createdAt,
      authorId: invoiceComments.authorId,
      authorName: users.name,
      authorIsAccountant: users.isAccountant,
    })
    .from(invoiceComments)
    .leftJoin(users, eq(invoiceComments.authorId, users.id))
    .where(eq(invoiceComments.invoiceId, invoiceId))
    .orderBy(asc(invoiceComments.createdAt));
}

/**
 * Agrega un comentario. Devuelve la función que avisa por correo para que la
 * acción la corra después de responder (el correo no debe bloquear la UI).
 */
export async function addComment(invoiceId: string, rawBody: string, baseUrl: string) {
  const { user, invoice } = await requireInvoiceAccess(invoiceId, "read");
  const body = rawBody.trim();
  if (body.length === 0) throw new CommentError("Escriba un comentario.");
  if (body.length > COMMENT_MAX) throw new CommentError(`Máximo ${COMMENT_MAX} caracteres.`);

  const [comment] = await db
    .insert(invoiceComments)
    .values({ invoiceId, authorId: user.id, body })
    .returning({ id: invoiceComments.id });

  const notify = async () => {
    try {
      const to = await commentRecipients(invoiceId, invoice.companyId, invoice.uploadedBy, user.id);
      const [company] = await db
        .select({ legalName: companies.legalName })
        .from(companies)
        .where(eq(companies.id, invoice.companyId));
      await commentMailer.send({
        to,
        authorName: user.name,
        companyName: company.legalName,
        invoiceLabel: invoice.numeroFactura ?? invoice.razonSocialEmisor ?? "sin número",
        body,
        url: new URL(`/app/facturas/${invoiceId}`, baseUrl).toString(),
      });
    } catch (e) {
      console.error("No se pudo avisar del comentario", invoiceId, e);
    }
  };
  return { id: comment.id, notify };
}

/**
 * A quién avisar: quien subió la factura, los contadores de la empresa y
 * cualquiera que ya haya comentado, siempre que sigan teniendo acceso a la
 * empresa. Nunca a quien escribió el comentario.
 */
export async function commentRecipients(invoiceId: string, companyId: string, uploadedBy: string, authorId: string) {
  const accountants = await db
    .select({ id: accountantClients.accountantId })
    .from(accountantClients)
    .where(eq(accountantClients.companyId, companyId));
  const commenters = await db
    .selectDistinct({ id: invoiceComments.authorId })
    .from(invoiceComments)
    .where(and(eq(invoiceComments.invoiceId, invoiceId), isNotNull(invoiceComments.authorId)));

  const ids = [...new Set([uploadedBy, ...accountants.map((a) => a.id), ...commenters.map((c) => c.id!)])].filter(
    (id) => id !== authorId,
  );
  if (ids.length === 0) return [];
  const rows = await db
    .select({ email: users.email })
    .from(users)
    .where(
      and(
        inArray(users.id, ids),
        ne(users.id, authorId),
        or(
          exists(
            db
              .select()
              .from(companyMembers)
              .where(and(eq(companyMembers.userId, users.id), eq(companyMembers.companyId, companyId))),
          ),
          exists(
            db
              .select()
              .from(accountantClients)
              .where(and(eq(accountantClients.accountantId, users.id), eq(accountantClients.companyId, companyId))),
          ),
        ),
      ),
    );
  return rows.map((r) => r.email);
}
