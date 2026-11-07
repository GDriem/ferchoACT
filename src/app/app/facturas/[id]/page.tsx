import { AlertTriangleIcon, ExternalLinkIcon, FileTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { InvoiceForm } from "@/components/invoice-form";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ForbiddenError } from "@/lib/auth/access";
import { formatDate } from "@/lib/format";
import { getInvoiceForReview } from "@/lib/invoices";
import { initialInvoiceValues } from "@/lib/validation/invoice";
import { DiscardButton } from "./discard-button";
import { ProcessingRefresher } from "./processing-refresher";
import { SavedCard } from "./saved-card";

export const metadata: Metadata = { title: "Confirmar factura" };

export default function InvoicePage({ params }: PageProps<"/app/facturas/[id]">) {
  return (
    <Suspense fallback={<ReviewSkeleton />}>
      {params.then(({ id }) => (
        <Review id={id} />
      ))}
    </Suspense>
  );
}

function ReviewSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-busy>
      <Skeleton className="h-80" />
      <div className="grid gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    </div>
  );
}

async function load(id: string) {
  if (!z.guid().safeParse(id).success) notFound();
  try {
    return await getInvoiceForReview(id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}

async function Review({ id }: { id: string }) {
  const { invoice, company, file, duplicate, canEdit, as } = await load(id);
  const processing = invoice.status === "processing";
  const confirmed = !!invoice.confirmedAt;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h1 className="text-xl font-semibold">{confirmed ? "Factura" : "Confirme los datos"}</h1>
          <p className="text-sm text-muted-foreground">{company.legalName}</p>
        </div>
        <InvoiceStatusBadge status={invoice.status} />
      </div>

      {invoice.status === "rejected" && invoice.rejectionReason && (
        <Notice tone="error" title="Su contador rechazó esta factura">
          {invoice.rejectionReason} Corrija los datos y guárdela de nuevo.
        </Notice>
      )}
      {duplicate && (
        <Notice tone="warning" title="Parece que esta factura ya fue registrada">
          La subió {duplicate.uploadedBy} el {formatDate(duplicate.createdAt)}. Si es la misma, descarte esta subida.
          {as === "uploader" && canEdit && (
            <div className="mt-2">
              <DiscardButton invoiceId={invoice.id} />
            </div>
          )}
        </Notice>
      )}
      {invoice.ocrError && !confirmed && <Notice tone="warning" title="Lectura automática no disponible">{invoice.ocrError}</Notice>}

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <div className="lg:sticky lg:top-4">
          {file ? (
            file.contentType === "application/pdf" ? (
              <a
                href={file.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 rounded-xl border p-4 text-sm font-medium hover:bg-muted/50"
              >
                <FileTextIcon className="size-6 text-muted-foreground" aria-hidden /> Abrir PDF de la factura
                <ExternalLinkIcon className="ml-auto size-4 text-muted-foreground" aria-hidden />
              </a>
            ) : (
              <a href={file.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element -- SAS de lectura temporal */}
                <img src={file.url} alt="Foto de la factura" className="max-h-[45vh] w-full object-contain lg:max-h-[80vh]" />
              </a>
            )
          ) : (
            <p className="text-sm text-muted-foreground">Sin archivo.</p>
          )}
        </div>

        <div className="grid gap-4">
          {processing && (
            <div role="status" className="flex items-center gap-3 rounded-xl border bg-muted/40 p-4 text-sm">
              <ProcessingRefresher />
              <span>
                Leyendo su factura… Puede salir de esta pantalla: quedará como «Procesando» en{" "}
                <Link href="/app/facturas" className="font-medium underline underline-offset-4">
                  Mis facturas
                </Link>
                . También puede llenar los datos a mano.
              </span>
            </div>
          )}
          <InvoiceForm
            // Al terminar el OCR cambia la key y el formulario se vuelve a prellenar
            key={processing ? "processing" : "ready"}
            invoiceId={invoice.id}
            initial={initialInvoiceValues(invoice)}
            confidences={confirmed ? null : invoice.ocrConfidence}
            companyRtn={company.rtn}
            readOnly={!canEdit}
            submitLabel={confirmed ? "Guardar cambios" : "Confirmar factura"}
            savedSlot={as === "uploader" ? <SavedCard /> : undefined}
          />
          {!canEdit && (
            <p className="text-sm text-muted-foreground">
              {invoice.status === "validated" || invoice.status === "declared"
                ? "Su contador ya revisó esta factura; no se puede modificar."
                : "Solo quien subió la factura o el contador pueden modificarla."}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Notice({
  tone,
  title,
  children,
}: {
  tone: "warning" | "error";
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={
        tone === "error"
          ? "flex gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm"
          : "flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm"
      }
    >
      <AlertTriangleIcon
        className={tone === "error" ? "size-5 shrink-0 text-destructive" : "size-5 shrink-0 text-amber-700 dark:text-amber-400"}
        aria-hidden
      />
      <div className="grid gap-0.5">
        <p className="font-medium">{title}</p>
        <div className="text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

