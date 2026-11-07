import type { SessionUser } from "@/lib/auth/session";

/**
 * Reemplazo de @/lib/auth/session para tests. En cada archivo:
 *   vi.mock("@/lib/auth/session", () => import("<ruta>/test/session-mock"))
 */
let current: SessionUser | null = null;

export function loginAs(user: SessionUser | null) {
  current = user;
}

export const SESSION_COOKIE = "session";
export const getCurrentUser = async () => current;
export const createSession = async () => {};
export const deleteSession = async () => {};
