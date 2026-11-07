import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accountantClients, invoices } from "@/db/schema";
import { ForbiddenError } from "@/lib/auth/access";
import { createCompany, createUser, loginAs } from "../../test/helpers";
import { addComment, listComments } from "./comments";

vi.mock("@/lib/auth/session", () => import("../../test/session-mock"));

const sent = vi.hoisted(() => [] as { to: string[]; authorName: string; body: string; url: string }[]);
vi.mock("@/lib/mail", () => ({
  commentMailer: { send: async (email: (typeof sent)[number]) => (sent.push(email), { delivered: true }) },
}));

const baseUrl = "http://localhost:3000";

async function setup() {
  const { company, owner, member } = await createCompany();
  const accountant = await createUser({ isAccountant: true, name: "Contadora" });
  await db.insert(accountantClients).values({ accountantId: accountant.id, companyId: company.id });
  const [invoice] = await db
    .insert(invoices)
    .values({ companyId: company.id, uploadedBy: member.id, status: "needs_review", numeroFactura: "000-001-01-00000042" })
    .returning();
  return { company, owner, member, accountant, invoice };
}

describe("comentarios en facturas", () => {
  it("el contador comenta y se avisa por correo a quien subió la factura, no al autor", async () => {
    const { member, accountant, invoice } = await setup();
    sent.length = 0;
    loginAs(accountant);
    const { notify } = await addComment(invoice.id, "  Falta el CAI en la foto  ", baseUrl);
    await notify();

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toEqual([member.email]);
    expect(sent[0]).toMatchObject({
      authorName: "Contadora",
      body: "Falta el CAI en la foto",
      url: `${baseUrl}/app/facturas/${invoice.id}`,
    });

    loginAs(member);
    const list = await listComments(invoice.id);
    expect(list.map((c) => c.body)).toEqual(["Falta el CAI en la foto"]);
  });

  it("cuando responde quien la subió, se avisa al contador y a quienes ya comentaron", async () => {
    const { owner, member, accountant, invoice } = await setup();
    loginAs(owner);
    await addComment(invoice.id, "¿Es de octubre?", baseUrl);
    sent.length = 0;
    loginAs(member);
    const { notify } = await addComment(invoice.id, "Sí, ya la corregí", baseUrl);
    await notify();
    expect(sent[0].to.sort()).toEqual([accountant.email, owner.email].sort());
  });

  it("nadie ajeno a la empresa comenta ni lee comentarios", async () => {
    const { invoice } = await setup();
    const { member: otherCompanyMember } = await createCompany();
    loginAs(otherCompanyMember);
    await expect(addComment(invoice.id, "hola", baseUrl)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listComments(invoice.id)).rejects.toBeInstanceOf(ForbiddenError);

    loginAs(await createUser({ isAccountant: true }));
    await expect(addComment(invoice.id, "hola", baseUrl)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("no acepta comentarios vacíos", async () => {
    const { member, invoice } = await setup();
    loginAs(member);
    await expect(addComment(invoice.id, "   ", baseUrl)).rejects.toThrow("Escriba un comentario.");
  });
});
