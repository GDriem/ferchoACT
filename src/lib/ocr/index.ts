import "server-only";
import { env } from "@/lib/env";
import { createAzureOcr } from "./azure";
import { mockOcr } from "./mock";
import type { InvoiceOcr } from "./types";

export type { InvoiceOcr, OcrResult } from "./types";

/** Azure Document Intelligence si está configurado; si no, el mock. */
export function getOcr(): InvoiceOcr {
  if (env.AZURE_DI_ENDPOINT && env.AZURE_DI_KEY) {
    return createAzureOcr(env.AZURE_DI_ENDPOINT, env.AZURE_DI_KEY);
  }
  return mockOcr;
}
