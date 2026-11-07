import "server-only";
import type { InvitationKind } from "@/db/schema";
import { env } from "@/lib/env";
import { createAcsMailer } from "./acs";

export type InvitationEmail = {
  to: string;
  companyName: string;
  inviterName: string;
  kind: InvitationKind;
  url: string;
};

/**
 * Envío de invitaciones por correo. Azure Communication Services si está
 * configurado; si no, solo enlace.
 */
export interface InvitationMailer {
  /** `delivered: false` significa que el owner debe compartir el enlace a mano. */
  send(email: InvitationEmail): Promise<{ delivered: boolean }>;
}

/** Sin proveedor de correo: no envía nada; la UI muestra el enlace para copiarlo. */
const linkOnlyMailer: InvitationMailer = {
  async send() {
    return { delivered: false };
  },
};

export const invitationMailer: InvitationMailer =
  env.ACS_CONNECTION_STRING && env.ACS_EMAIL_SENDER
    ? createAcsMailer(env.ACS_CONNECTION_STRING, env.ACS_EMAIL_SENDER)
    : linkOnlyMailer;
