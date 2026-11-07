import "server-only";
import type { InvitationKind } from "@/db/schema";

export type InvitationEmail = {
  to: string;
  companyName: string;
  inviterName: string;
  kind: InvitationKind;
  url: string;
};

/**
 * Envío de invitaciones por correo. Cuando haya proveedor (p. ej. Azure
 * Communication Services) basta con otra implementación de esta interfaz.
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

export const invitationMailer: InvitationMailer = linkOnlyMailer;
