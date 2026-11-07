"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/access";
import { appBaseUrl } from "@/lib/app-url";
import {
  acceptInvitation as accept,
  createInvitation as create,
  declineInvitation as decline,
  InvitationError,
  revokeInvitation as revoke,
} from "@/lib/invitations";
import { invitationSchema, type FormState } from "@/lib/validation/auth";

export type InvitationState = (NonNullable<FormState> & { link?: string; delivered?: boolean }) | undefined;

export async function createInvitation(
  _prev: InvitationState,
  formData: FormData,
): Promise<InvitationState> {
  const parsed = invitationSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  try {
    const { url, delivered } = await create({ ...parsed.data, baseUrl: await appBaseUrl() });
    refresh();
    return { link: url, delivered };
  } catch (e) {
    if (e instanceof ForbiddenError) return { message: "Solo el dueño de la empresa puede invitar." };
    throw e;
  }
}

export async function revokeInvitation(companyId: string, invitationId: string) {
  const ids = z.object({ companyId: z.guid(), invitationId: z.guid() }).safeParse({ companyId, invitationId });
  if (!ids.success) return;
  await revoke(ids.data.companyId, ids.data.invitationId);
  refresh();
}

export async function acceptInvitation(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  let result;
  try {
    result = await accept(token);
  } catch (e) {
    if (e instanceof InvitationError) return { message: e.message };
    throw e;
  }
  redirect(result.kind === "accountant" ? "/app" : `/app/empresas/${result.companyId}`);
}

export async function declineInvitation(_prev: FormState, formData: FormData): Promise<FormState> {
  const token = String(formData.get("token") ?? "");
  try {
    await decline(token);
  } catch (e) {
    if (e instanceof InvitationError) return { message: e.message };
    throw e;
  }
  redirect("/invitacion/rechazada");
}
