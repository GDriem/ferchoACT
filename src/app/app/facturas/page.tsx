import { ChevronRightIcon, ReceiptTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { ScanFab } from "@/components/scan-fab";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, formatMoney, formatPeriod } from "@/lib/format";
import { listMyInvoices } from "@/lib/invoices";

export const metadata: Metadata = { title: "Mis facturas" };

export default function MyInvoicesPage() {
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold">Mis facturas</h1>
      <Suspense fallback={<ListSkeleton />}>
        <InvoiceList />
      </Suspense>
      <ScanFab />
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-2" aria-busy>
      {Array.from({ length: 5 }, (_, i) => (
        <Skeleton key={i} className="h-16" />
      ))}
    </div>
  );
}

async function InvoiceList() {
  const rows = await listMyInvoices();
  if (rows.length === 0) {
    return (
      <div className="grid place-items-center gap-2 rounded-xl border border-dashed p-10 text-center">
        <ReceiptTextIcon className="size-8 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">
          Aún no ha subido facturas. Toque «Escanear factura» para subir una compra, un gasto o una venta.
        </p>
      </div>
    );
  }

  // Agrupadas por período (las que aún no tienen fecha van primero)
  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.year && r.month ? formatPeriod(r.year, r.month) : "Sin período todavía";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const multiCompany = new Set(rows.map((r) => r.companyName)).size > 1;

  return (
    <div className="grid gap-6">
      {[...groups].map(([period, items]) => (
        <section key={period} className="grid gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">{period}</h2>
          <ul className="divide-y rounded-xl border">
            {items.map((r) => (
              <li key={r.id}>
                <Link href={`/app/facturas/${r.id}`} className="flex min-h-16 items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {r.kind === "sale" && (
                        <span className="shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">Venta</span>
                      )}
                      <span className="truncate">
                        {r.kind === "sale"
                          ? (r.nombreComprador ?? "Consumidor final")
                          : (r.razonSocialEmisor ?? (r.status === "processing" ? "Leyendo factura…" : "Sin proveedor"))}
                      </span>
                    </p>
                    <p className="truncate text-xs text-muted-foreground tabular-nums">
                      {[r.numeroFactura, formatDate(r.fechaEmision ?? r.createdAt), multiCompany && r.companyName]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {r.status === "rejected" && r.rejectionReason && (
                      <p className="truncate text-xs text-destructive">Motivo: {r.rejectionReason}</p>
                    )}
                    {r.status === "needs_review" && !r.confirmedAt && (
                      <p className="text-xs text-amber-700 dark:text-amber-400">Falta confirmar los datos</p>
                    )}
                  </div>
                  <div className="grid justify-items-end gap-1">
                    <InvoiceStatusBadge status={r.status} />
                    {Number(r.total) > 0 && <span className="text-sm tabular-nums">{formatMoney(r.total)}</span>}
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
