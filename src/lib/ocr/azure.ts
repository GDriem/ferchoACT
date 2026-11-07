import "server-only";
import DocumentIntelligence, {
  getLongRunningPoller,
  isUnexpected,
  type AnalyzeOperationOutput,
} from "@azure-rest/ai-document-intelligence";
import { mapAnalyzeResult } from "./azure-mapping";
import type { InvoiceOcr } from "./types";

/**
 * prebuilt-invoice + regex hondureñas sobre el texto completo. Se envía el
 * archivo en base64 (no una URL) para que funcione también con Azurite local,
 * que Azure no puede alcanzar.
 */
export function createAzureOcr(endpoint: string, key: string): InvoiceOcr {
  const client = DocumentIntelligence(endpoint, { key });
  return {
    async extractInvoice(file) {
      const initial = await client.path("/documentModels/{modelId}:analyze", "prebuilt-invoice").post({
        contentType: "application/json",
        body: { base64Source: Buffer.from(file.data).toString("base64") },
      });
      if (isUnexpected(initial)) throw new Error(initial.body.error.message);

      const result = (await getLongRunningPoller(client, initial).pollUntilDone()).body as AnalyzeOperationOutput;
      if (result.status !== "succeeded" || !result.analyzeResult) {
        throw new Error(`Document Intelligence terminó en estado ${result.status}`);
      }
      return mapAnalyzeResult(result.analyzeResult);
    },
  };
}
