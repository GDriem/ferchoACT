import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { companyInvitations, users } from "@/db/schema";
import { ForbiddenError, requireCompanyAccess } from "@/lib/auth/access";
import { createCompany, createUser, loginAs } from "../../test/helpers";
import {
  acceptInvitation,
  createInvitation,
  declineInvitation,
  getCompanyDetail,
  hashInvitationToken,
  revokeInvitation,
} from "./invitations";

vi.mock("@/lib/auth/session", () => import("../../test/session-mock"));

const baseUrl = "http://localhost:3000";
const tokenOf = (url: string) => url.split("/invitacion/")[1];

describe("invitaciones y autorización por empresa", () => {
  it("un member no puede invitar", async () => {
    const { company, member } = await createCompany();
    loginAs(member);
    await expect(
      createInvitation({ companyId: company.id, kind: "member", baseUrl }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("alguien ajeno a la empresa no ve su ficha", async () => {
    const { company } = await createCompany();
    loginAs(await createUser());
    await expect(getCompanyDetail(company.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("un contador sin vínculo no ve la empresa ni sus facturas", async () => {
    const { company } = await createCompany();
    loginAs(await createUser({ isAccountant: true }));
    await expect(getCompanyDetail(company.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requireCompanyAccess(company.id, "invoice:read_all")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("el owner invita a un miembro y el enlace sirve una sola vez", async () => {
    const { company, owner } = await createCompany();
    loginAs(owner);
    const { url } = await createInvitation({ companyId: company.id, kind: "member", baseUrl });
    expect(url).toMatch(/^http:\/\/localhost:3000\/invitacion\/[\w-]{43}$/);

    // En la base solo queda el hash del token
    const [row] = await db
      .select()
      .from(companyInvitations)
      .where(eq(companyInvitations.tokenHash, hashInvitationToken(tokenOf(url))));
    expect(row.kind).toBe("member");

    const newcomer = await createUser();
    loginAs(newcomer);
    await expect(acceptInvitation(tokenOf(url))).resolves.toMatchObject({ kind: "member" });
    const detail = await getCompanyDetail(company.id);
    expect(detail.members.map((m) => m.id)).toContain(newcomer.id);
    // Un member ve la ficha pero no las invitaciones pendientes
    expect(detail.canManage).toBe(false);

    loginAs(await createUser());
    await expect(acceptInvitation(tokenOf(url))).rejects.toMatchObject({ code: "invalid" });
  });

  it("un enlace vencido o anulado no se puede usar", async () => {
    const { company, owner } = await createCompany();
    loginAs(owner);
    const expired = await createInvitation({ companyId: company.id, kind: "member", baseUrl });
    await db
      .update(companyInvitations)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(companyInvitations.id, expired.id));
    const revoked = await createInvitation({ companyId: company.id, kind: "member", baseUrl });
    await revokeInvitation(company.id, revoked.id);

    loginAs(await createUser());
    await expect(acceptInvitation(tokenOf(expired.url))).rejects.toMatchObject({ code: "invalid" });
    await expect(acceptInvitation(tokenOf(revoked.url))).rejects.toMatchObject({ code: "invalid" });
  });

  it("una invitación rechazada ya no se puede aceptar y sale de pendientes", async () => {
    const { company, owner } = await createCompany();
    loginAs(owner);
    const { url } = await createInvitation({ companyId: company.id, kind: "member", baseUrl });

    loginAs(null); // se puede rechazar sin tener cuenta
    await declineInvitation(tokenOf(url));
    loginAs(await createUser());
    await expect(acceptInvitation(tokenOf(url))).rejects.toMatchObject({ code: "invalid" });
    await expect(declineInvitation(tokenOf(url))).rejects.toMatchObject({ code: "invalid" });

    loginAs(owner);
    expect((await getCompanyDetail(company.id)).pending).toHaveLength(0);
  });

  it("una invitación con correo solo la rechaza esa cuenta", async () => {
    const { company, owner } = await createCompany();
    const invited = await createUser();
    loginAs(owner);
    const { url } = await createInvitation({ companyId: company.id, kind: "accountant", email: invited.email, baseUrl });

    loginAs(null);
    await expect(declineInvitation(tokenOf(url))).rejects.toMatchObject({ code: "email_mismatch" });
    loginAs(await createUser());
    await expect(declineInvitation(tokenOf(url))).rejects.toMatchObject({ code: "email_mismatch" });
    loginAs(invited);
    await expect(declineInvitation(tokenOf(url))).resolves.toBeUndefined();
  });

  it("un member no puede anular invitaciones", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(owner);
    const inv = await createInvitation({ companyId: company.id, kind: "member", baseUrl });
    loginAs(member);
    await expect(revokeInvitation(company.id, inv.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("si la invitación tiene correo, solo esa cuenta la acepta", async () => {
    const { company, owner } = await createCompany();
    const invited = await createUser();
    loginAs(owner);
    const { url } = await createInvitation({
      companyId: company.id,
      kind: "member",
      email: invited.email,
      baseUrl,
    });

    loginAs(await createUser());
    await expect(acceptInvitation(tokenOf(url))).rejects.toMatchObject({ code: "email_mismatch" });
    loginAs(invited);
    await expect(acceptInvitation(tokenOf(url))).resolves.toMatchObject({ kind: "member" });
  });

  it("al aceptar como contador queda vinculado y con acceso de revisión", async () => {
    const { company, owner } = await createCompany();
    loginAs(owner);
    const { url } = await createInvitation({ companyId: company.id, kind: "accountant", baseUrl });

    // Cuenta normal: al aceptar pasa a ser contador
    const accountant = await createUser();
    loginAs(accountant);
    await acceptInvitation(tokenOf(url));

    const [row] = await db
      .select({ isAccountant: users.isAccountant })
      .from(users)
      .where(eq(users.id, accountant.id));
    expect(row.isAccountant).toBe(true);

    loginAs({ ...accountant, isAccountant: true });
    await expect(requireCompanyAccess(company.id, "invoice:review")).resolves.toMatchObject({
      via: "accountant",
    });
    // El contador no gestiona el equipo
    await expect(requireCompanyAccess(company.id, "members:manage")).rejects.toBeInstanceOf(
      ForbiddenError,
    );

    loginAs(owner);
    const detail = await getCompanyDetail(company.id);
    expect(detail.accountants.map((a) => a.id)).toEqual([accountant.id]);
  });

  it("un member ya existente no consume el enlace", async () => {
    const { company, owner, member } = await createCompany();
    loginAs(owner);
    const { url } = await createInvitation({ companyId: company.id, kind: "member", baseUrl });
    loginAs(member);
    await expect(acceptInvitation(tokenOf(url))).rejects.toMatchObject({ code: "already_member" });
    loginAs(await createUser());
    await expect(acceptInvitation(tokenOf(url))).resolves.toMatchObject({ kind: "member" });
  });
});
