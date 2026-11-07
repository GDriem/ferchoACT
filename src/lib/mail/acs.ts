import "server-only";
import { EmailClient } from "@azure/communication-email";
import type { InvitationEmail, InvitationMailer } from "./index";
import { renderInvitationEmail } from "./template";

/**
 * Azure Communication Services Email. Si el envío falla la invitación igual
 * queda creada: se devuelve `delivered: false` y la UI muestra el enlace.
 */
export function createAcsMailer(connectionString: string, senderAddress: string): InvitationMailer {
  const client = new EmailClient(connectionString);
  return {
    async send(email: InvitationEmail) {
      const { subject, html, plainText } = renderInvitationEmail(email);
      try {
        // beginSend resuelve cuando ACS aceptó el mensaje; no esperamos la entrega final.
        await client.beginSend({
          senderAddress,
          recipients: { to: [{ address: email.to }] },
          content: { subject, html, plainText },
        });
        return { delivered: true };
      } catch (e) {
        console.error("No se pudo enviar la invitación por correo", e);
        return { delivered: false };
      }
    },
  };
}
