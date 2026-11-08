import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/** URL pública de la app para enlaces en correos. Si no hay APP_URL se usa el host de la petición. */
export async function appBaseUrl() {
  if (env.APP_URL) return env.APP_URL;
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${h.get("x-forwarded-host") ?? h.get("host")}`;
}
