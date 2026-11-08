import { z } from "zod";
import { ForbiddenError } from "@/lib/auth/access";
import { purchasesXlsx, salesBookXlsx } from "@/lib/reports-xlsx";
import { parsePeriodParam } from "@/lib/review";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Descarga de los reportes de trabajo del mes en Excel: /api/reportes/<empresa>/<yyyy-mm>/<ventas|compras>. */
export async function GET(_req: Request, ctx: RouteContext<"/api/reportes/[empresaId]/[periodo]/[tipo]">) {
  const { empresaId, periodo, tipo } = await ctx.params;
  const target = parsePeriodParam(periodo);
  if (!target || !z.guid().safeParse(empresaId).success || (tipo !== "ventas" && tipo !== "compras")) {
    return new Response("No encontrado", { status: 404 });
  }
  try {
    const build = tipo === "ventas" ? salesBookXlsx : purchasesXlsx;
    const { buffer, company } = await build(empresaId, target.year, target.month);
    const name = `${tipo === "ventas" ? "Ventas" : "Compras"} ${company.legalName} ${periodo}.xlsx`;
    return new Response(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": `attachment; filename="${tipo}-${periodo}.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    // 404 para no revelar que la empresa existe
    if (e instanceof ForbiddenError) return new Response("No encontrado", { status: 404 });
    throw e;
  }
}
