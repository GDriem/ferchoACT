import "server-only";
import { EmailClient } from "@azure/communication-email";
import type { MailMessage, Mailer } from "./index";

/**
 * Azure Communication Services Email. Si el envío falla se devuelve
 * `delivered: false`: lo que originó el correo (invitación, comentario) ya
 * quedó guardado.
 */
export function createAcsMailer(connectionString: string, senderAddress: string): Mailer {
  const client = new EmailClient(connectionString);
  return {
    async send({ to, subject, html, plainText }: MailMessage) {
      try {
        // beginSend resuelve cuando ACS aceptó el mensaje; no esperamos la entrega final.
        // Con varios destinatarios van en bcc para no exponer los correos entre sí.
        const addresses = to.map((address) => ({ address }));
        await client.beginSend({
          senderAddress,
          recipients: addresses.length === 1 ? { to: addresses } : { bcc: addresses },
          content: { subject, html, plainText },
        });
        return { delivered: true };
      } catch (e) {
        console.error("No se pudo enviar el correo", subject, e);
        return { delivered: false };
      }
    },
  };
}
