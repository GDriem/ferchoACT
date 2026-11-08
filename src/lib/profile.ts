import "server-only";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, companies, users } from "@/db/schema";
import { requireCompanyAccess, requireUser } from "@/lib/auth/access";
import { createReadUrl, deleteBlob, uploadBlob } from "@/lib/storage";
import { ensureAccountantCode } from "@/lib/team";

/** Fotos de perfil y logos: ya llegan reducidas desde el navegador. */
export const MAX_IMAGE_BYTES = 1024 * 1024;

export class ProfileError extends Error {
  constructor(message: string) {
    super(message);
  }
}

const IMAGE_TYPES = {
  "image/jpeg": { ext: "jpg", magic: [0xff, 0xd8, 0xff] },
  "image/png": { ext: "png", magic: [0x89, 0x50, 0x4e, 0x47] },
  "image/webp": { ext: "webp", magic: [0x52, 0x49, 0x46, 0x46] }, // "RIFF"
} as const;

/** Verifica tipo y tamaño mirando los primeros bytes, no solo lo que dice el navegador. */
export function checkImage(data: Uint8Array, contentType: string) {
  const type = IMAGE_TYPES[contentType as keyof typeof IMAGE_TYPES];
  if (!type || !type.magic.every((b, i) => data[i] === b)) {
    throw new ProfileError("Suba una imagen JPG, PNG o WEBP.");
  }
  if (data.byteLength === 0 || data.byteLength > MAX_IMAGE_BYTES) {
    throw new ProfileError("La imagen debe pesar menos de 1 MB.");
  }
  return type.ext;
}

export async function getProfile() {
  const user = await requireUser();
  const [row] = await db
    .select({ avatarBlob: users.avatarBlob, accountantCode: users.accountantCode, createdAt: users.createdAt })
    .from(users)
    .where(eq(users.id, user.id));
  const accountantCode = user.isAccountant ? (row.accountantCode ?? (await ensureAccountantCode(user.id))) : null;
  return {
    ...user,
    avatarUrl: row.avatarBlob ? await createReadUrl(row.avatarBlob) : null,
    accountantCode,
    createdAt: row.createdAt,
  };
}

/** Foto del usuario en sesión (para el encabezado). */
export async function getAvatarUrl(userId: string) {
  const [row] = await db.select({ avatarBlob: users.avatarBlob }).from(users).where(eq(users.id, userId));
  return row?.avatarBlob ? createReadUrl(row.avatarBlob) : null;
}

export async function updateName(name: string) {
  const user = await requireUser();
  await db.update(users).set({ name }).where(eq(users.id, user.id));
}

export async function setAvatar(data: Uint8Array, contentType: string) {
  const user = await requireUser();
  const ext = checkImage(data, contentType);
  const blobName = `avatars/${user.id}/${randomUUID()}.${ext}`;
  await uploadBlob(blobName, data, contentType);
  const [old] = await db.select({ avatarBlob: users.avatarBlob }).from(users).where(eq(users.id, user.id));
  await db.update(users).set({ avatarBlob: blobName }).where(eq(users.id, user.id));
  if (old?.avatarBlob) await deleteBlob(old.avatarBlob);
}

export async function removeAvatar() {
  const user = await requireUser();
  const [old] = await db.select({ avatarBlob: users.avatarBlob }).from(users).where(eq(users.id, user.id));
  await db.update(users).set({ avatarBlob: null }).where(eq(users.id, user.id));
  if (old?.avatarBlob) await deleteBlob(old.avatarBlob);
}

/** Logo de la empresa: solo el dueño. */
export async function setCompanyLogo(companyId: string, data: Uint8Array | null, contentType?: string) {
  const { user } = await requireCompanyAccess(companyId, "members:manage");
  let blobName: string | null = null;
  if (data) {
    const ext = checkImage(data, contentType ?? "");
    blobName = `logos/${companyId}/${randomUUID()}.${ext}`;
    await uploadBlob(blobName, data, contentType!);
  }
  const [old] = await db.select({ logoBlob: companies.logoBlob }).from(companies).where(eq(companies.id, companyId));
  await db.transaction(async (tx) => {
    await tx.update(companies).set({ logoBlob: blobName }).where(eq(companies.id, companyId));
    await tx.insert(auditLog).values({
      companyId,
      userId: user.id,
      action: blobName ? "company.logo_changed" : "company.logo_removed",
      entity: "company",
      entityId: companyId,
    });
  });
  if (old?.logoBlob) await deleteBlob(old.logoBlob);
}
