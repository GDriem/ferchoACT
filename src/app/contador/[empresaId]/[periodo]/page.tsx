import Decimal from "decimal.js";
import { Building2Icon, DownloadIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { z } from "zod";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ForbiddenError } from "@/lib/auth/access";
import { formatMoney, formatPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";
import { currentPeriodParam, getPeriodInvoices, listClients, parsePeriodParam, periodParam } from "@/lib/review";
import { PeriodSelectors } from "./period-selectors";
import { ReviewTable } from "./review-table";
import { SarReportButton } from "./sar-report-button";

export const metadata: Metadata = { title: "Revisión de facturas" };

export default function PeriodPage({ params, searchParams }: PageProps<"/contador/[empresaId]/[periodo]">) {
  return (
    <Suspense fallback={<PeriodSkeleton />}>
      {Promise.all([params, searchParams]).then(([{ empresaId, periodo }, sp]) => (
        <PeriodView companyId={empresaId} periodo={periodo} kind={sp.tipo === "ventas" ? "sale" : "purchase"} />
      ))}
    </Suspense>
  );
}

function PeriodSkeleton() {
  return (
    <div className="grid gap-6" aria-busy>
      <div className="flex gap-3">
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-11 w-44" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-96" />
    </div>
  );
}

/** Últimos 12 meses + los que tengan período, del más reciente al más antiguo. */
function periodOptions(current: string, existing: { year: number; month: number }[], selected: string) {
  const set = new Set([selected, ...existing.map((p) => periodParam(p.year, p.month))]);
  const { year, month } = parsePeriodParam(current)!;
  for (let i = 0; i < 12; i++) {
    const d = new Date(Date.UTC(year, month - 1 - i, 1));
    set.add(periodParam(d.getUTCFullYear(), d.getUTCMonth() + 1));
  }
  return [...set]
    .sort()
    .reverse()
    .map((value) => {
      const p = parsePeriodParam(value)!;
      return { value, label: formatPeriod(p.year, p.month) };
    });
}

async function PeriodView({ companyId, periodo, kind }: { companyId: string; periodo: string; kind: "purchase" | "sale" }) {
  const target = parsePeriodParam(periodo);
  if (!target || !z.guid().safeParse(companyId).success) notFound();

  let data;
  try {
    data = await getPeriodInvoices(companyId, target.year, target.month, kind);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
  const clients = await listClients();
  await connection();
  const months = periodOptions(currentPeriodParam(), data.periods, periodo);

  // Totales del mes: sin las rechazadas
  const counted = data.rows.filter((r) => r.status !== "rejected");
  const sum = (k: "importeGravado15" | "importeGravado18" | "importeExento" | "importeExonerado" | "isv15" | "isv18") =>
    counted.reduce((acc, r) => acc.plus(r[k]), new Decimal(0));
  const pending = data.rows.filter((r) => r.status === "needs_review" || r.status === "processing").length;
  const closed = data.period?.status === "closed";

  const sale = kind === "sale";
  const cards = [
    { label: "Total del mes", value: formatMoney(counted.reduce((acc, r) => acc.plus(r.total), new Decimal(0)).toFixed(2)) },
    { label: "Gravado 15 %", value: formatMoney(sum("importeGravado15").toFixed(2)) },
    { label: "Gravado 18 %", value: formatMoney(sum("importeGravado18").toFixed(2)) },
    { label: "Exento y exonerado", value: formatMoney(sum("importeExento").plus(sum("importeExonerado")).toFixed(2)) },
    { label: sale ? "ISV cobrado" : "ISV pagado", value: formatMoney(sum("isv15").plus(sum("isv18")).toFixed(2)) },
    { label: "Por revisar", value: String(pending), highlight: pending > 0 },
  ];

  const company = clients.find((c) => c.id === companyId);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PeriodSelectors
          companyId={companyId}
          periodo={periodo}
          tipo={sale ? "ventas" : undefined}
          companies={clients.map((c) => ({ value: c.id, label: c.legalName }))}
          months={months}
        />
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/app/empresas/${companyId}`}
            className={buttonVariants({ variant: "ghost", size: "lg", className: "h-11" })}
          >
            <Building2Icon /> Ficha y categorías
          </Link>
          <a
            href={`/api/reportes/${companyId}/${periodo}/${sale ? "ventas" : "compras"}`}
            download
            className={buttonVariants({ variant: "outline", size: "lg", className: "h-11" })}
          >
            <DownloadIcon /> {sale ? "Libro de ventas (Excel)" : "Compras por categoría (Excel)"}
          </a>
          <SarReportButton />
        </div>
      </div>

      <nav aria-label="Tipo de factura" className="flex gap-1 border-b">
        {(
          [
            { value: "purchase", label: "Compras y gastos", href: `/contador/${companyId}/${periodo}` },
            { value: "sale", label: "Ventas", href: `/contador/${companyId}/${periodo}?tipo=ventas` },
          ] as const
        ).map((t) => {
          const active = t.value === kind;
          return (
            <Link
              key={t.value}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "-mb-px flex min-h-11 items-center gap-2 border-b-2 px-4 text-sm font-medium",
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
              {!active && data.otherPending > 0 && (
                <span className="rounded-full bg-amber-500/15 px-1.5 text-xs text-amber-800 tabular-nums dark:text-amber-300">
                  {data.otherPending} por revisar
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <h1 className="sr-only">
        {sale ? "Ventas" : "Compras y gastos"} · {company?.legalName} · {formatPeriod(target.year, target.month)}
      </h1>
      {closed && (
        <p role="status" className="rounded-xl border bg-sky-500/10 p-3 text-sm">
          Este período ya fue declarado. Las facturas son de solo lectura.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {cards.map((c) => (
          <Card key={c.label} size="sm" className={c.highlight ? "ring-amber-500/50" : undefined}>
            <CardHeader>
              <CardDescription>{c.label}</CardDescription>
              <CardTitle className="text-lg tabular-nums">{c.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <ReviewTable
        companyId={companyId}
        periodo={periodo}
        months={months}
        readOnly={closed}
        kind={kind}
        rows={data.rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
          confirmedAt: r.confirmedAt?.toISOString() ?? null,
        }))}
      />
    </div>
  );
}
