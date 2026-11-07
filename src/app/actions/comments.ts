"use server";

import { after } from "next/server";
import { z } from "zod";
import { fail, type ActionResult } from "@/lib/action-result";
import { appBaseUrl } from "@/lib/app-url";
import { ForbiddenError, requireUser } from "@/lib/auth/access";
import { addComment as add, CommentError, COMMENT_MAX, listComments as list } from "@/lib/comments";
import { InvoiceError } from "@/lib/invoices";

export type CommentItem = {
  id: string;
  body: string;
  createdAt: string;
  authorName: string;
  mine: boolean;
  fromAccountant: boolean;
};

const NO_ACCESS = "No tiene acceso a esta factura.";

export async function listComments(invoiceId: string): Promise<ActionResult<CommentItem[]>> {
  if (!z.guid().safeParse(invoiceId).success) return fail("invalid", "Factura no encontrada.");
  try {
    const user = await requireUser();
    const rows = await list(invoiceId);
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        body: r.body,
        createdAt: r.createdAt.toISOString(),
        authorName: r.authorName ?? "Usuario eliminado",
        mine: r.authorId === user.id,
        fromAccountant: !!r.authorIsAccountant,
      })),
    };
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof InvoiceError) return fail("forbidden", NO_ACCESS);
    throw e;
  }
}

/** Guarda el comentario y avisa por correo después de responder. */
export async function addComment(input: { invoiceId: string; body: string }): Promise<ActionResult<{ id: string }>> {
  const parsed = z.object({ invoiceId: z.guid(), body: z.string().max(COMMENT_MAX) }).safeParse(input);
  if (!parsed.success) return fail("invalid", `El comentario puede tener hasta ${COMMENT_MAX} caracteres.`);
  try {
    const { id, notify } = await add(parsed.data.invoiceId, parsed.data.body, await appBaseUrl());
    after(notify);
    return { ok: true, data: { id } };
  } catch (e) {
    if (e instanceof CommentError) return fail("invalid", e.message);
    if (e instanceof ForbiddenError || e instanceof InvoiceError) return fail("forbidden", NO_ACCESS);
    throw e;
  }
}
