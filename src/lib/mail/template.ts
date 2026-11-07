import type { CommentEmail, InvitationEmail } from "./index";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderInvitationEmail({ companyName, inviterName, kind, url }: InvitationEmail) {
  const role =
    kind === "accountant"
      ? "como su contador, para revisar sus facturas y preparar la declaración ante el SAR"
      : "a su equipo, para escanear y subir facturas";
  const subject = `${inviterName} le invitó a ${companyName}`;
  const plainText = [
    `${inviterName} le invitó a ${companyName} ${role}.`,
    "",
    `Abra este enlace para aceptar: ${url}`,
    "",
    "El enlace es de un solo uso y vence en 7 días. Si no esperaba esta invitación, ignore este correo.",
  ].join("\n");
  const html = `<!doctype html>
<html lang="es">
<body style="font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5;max-width:520px;margin:0 auto;padding:24px">
  <p><strong>${escapeHtml(inviterName)}</strong> le invitó a <strong>${escapeHtml(companyName)}</strong> ${role}.</p>
  <p style="margin:28px 0">
    <a href="${escapeHtml(url)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Aceptar invitación</a>
  </p>
  <p style="font-size:13px;color:#555">Si el botón no funciona, copie este enlace en su navegador:<br><span style="word-break:break-all">${escapeHtml(url)}</span></p>
  <p style="font-size:13px;color:#555">El enlace es de un solo uso y vence en 7 días. Si no esperaba esta invitación, ignore este correo.</p>
</body>
</html>`;
  return { subject, html, plainText };
}

export function renderCommentEmail({ authorName, companyName, invoiceLabel, body, url }: CommentEmail) {
  const subject = `${authorName} comentó la factura ${invoiceLabel} · ${companyName}`;
  const plainText = [
    `${authorName} escribió sobre la factura ${invoiceLabel} de ${companyName}:`,
    "",
    body,
    "",
    `Ver y responder: ${url}`,
  ].join("\n");
  const quoted = escapeHtml(body).replace(/\n/g, "<br>");
  const html = `<!doctype html>
<html lang="es">
<body style="font-family:system-ui,-apple-system,sans-serif;color:#111;line-height:1.5;max-width:520px;margin:0 auto;padding:24px">
  <p><strong>${escapeHtml(authorName)}</strong> escribió sobre la factura <strong>${escapeHtml(invoiceLabel)}</strong> de ${escapeHtml(companyName)}:</p>
  <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #ccc;background:#f6f6f6">${quoted}</blockquote>
  <p style="margin:28px 0">
    <a href="${escapeHtml(url)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">Ver y responder</a>
  </p>
  <p style="font-size:13px;color:#555">Recibe este correo porque participa en la revisión de esta factura.</p>
</body>
</html>`;
  return { subject, html, plainText };
}
