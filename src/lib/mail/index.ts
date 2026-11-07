import "server-only";
import type { InvitationKind } from "@/db/schema";
import { env } from "@/lib/env";
import { createAcsMailer } from "./acs";
import { renderCommentEmail, renderInvitationEmail } from "./template";

export type MailMessage = { to: string[]; subject: string; html: string; plainText: string };

/**
 * Envío de correos. Azure Communication Services si está configurado; si
 * no, no se envía nada (las invitaciones muestran el enlace para copiarlo).
 */
export interface Mailer {
  /** `delivered: false` si no hay proveedor o el envío falló. Nunca lanza. */
  send(message: MailMessage): Promise<{ delivered: boolean }>;
}

const noopMailer: Mailer = {
  async send() {
    return { delivered: false };
  },
};

export const mailer: Mailer =
  env.ACS_CONNECTION_STRING && env.ACS_EMAIL_SENDER
    ? createAcsMailer(env.ACS_CONNECTION_STRING, env.ACS_EMAIL_SENDER)
    : noopMailer;

export type InvitationEmail = {
  to: string;
  companyName: string;
  inviterName: string;
  kind: InvitationKind;
  url: string;
};

export const invitationMailer = {
  /** `delivered: false` significa que el owner debe compartir el enlace a mano. */
  send: (email: InvitationEmail) => mailer.send({ to: [email.to], ...renderInvitationEmail(email) }),
};

export type CommentEmail = {
  to: string[];
  authorName: string;
  companyName: string;
  invoiceLabel: string;
  body: string;
  url: string;
};

export const commentMailer = {
  send: (email: CommentEmail) =>
    email.to.length ? mailer.send({ to: email.to, ...renderCommentEmail(email) }) : Promise.resolve({ delivered: false }),
};
