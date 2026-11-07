import { describe, expect, it } from "vitest";
import { renderInvitationEmail } from "./template";

const base = {
  to: "ana@example.com",
  companyName: "Ferretería <El Martillo>",
  inviterName: "Ana & Luis",
  url: "https://app.example.com/invitacion/abc",
};

describe("renderInvitationEmail", () => {
  it("escapa los datos del usuario en el HTML", () => {
    const { html } = renderInvitationEmail({ ...base, kind: "member" });
    expect(html).toContain("Ferretería &lt;El Martillo&gt;");
    expect(html).toContain("Ana &amp; Luis");
    expect(html).not.toContain("<El Martillo>");
  });

  it("incluye el enlace y el texto según el tipo", () => {
    const member = renderInvitationEmail({ ...base, kind: "member" });
    const accountant = renderInvitationEmail({ ...base, kind: "accountant" });
    expect(member.plainText).toContain(base.url);
    expect(member.plainText).toContain("a su equipo");
    expect(accountant.plainText).toContain("como su contador");
    expect(accountant.subject).toBe("Ana & Luis le invitó a Ferretería <El Martillo>");
  });
});
