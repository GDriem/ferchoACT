"use client";

import { CheckIcon, ExternalLinkIcon, FileTextIcon, XIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { getInvoiceDetail, rejectBatch, validateBatch } from "@/app/actions/review";
import { InvoiceComments } from "@/components/invoice-comments";
import { InvoiceForm } from "@/components/invoice-form";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";

type Detail = Extract<Awaited<ReturnType<typeof getInvoiceDetail>>, { ok: true }>["data"];

/** Panel lateral: imagen original a la izquierda y datos para corregir a la derecha. */
export function InvoiceSheet({
  invoiceId,
  companyId,
  onOpenChange,
}: {
  invoiceId: string | null;
  companyId: string;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [validating, startValidating] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");

  const load = useCallback(
    (id: string) =>
      startLoading(async () => {
        setError(null);
        const r = await getInvoiceDetail(id);
        if (r.ok) setDetail(r.data);
        else setError(r.error.message);
      }),
    [],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- limpiar el panel al cambiar de factura
    setDetail(null);
    if (invoiceId) load(invoiceId);
  }, [invoiceId, load]);

  const onSaved = useCallback(() => {
    toast.success("Cambios guardados");
    router.refresh();
    if (invoiceId) load(invoiceId);
  }, [invoiceId, load, router]);

  return (
    <Sheet open={!!invoiceId} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-5xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            Factura {detail?.initial.numeroFactura || ""}
            {detail && <InvoiceStatusBadge status={detail.status} />}
          </SheetTitle>
          <SheetDescription>
            {detail?.kind === "sale"
              ? `Venta${detail.initial.nombreComprador ? ` a ${detail.initial.nombreComprador}` : ""}`
              : detail?.initial.razonSocialEmisor || "Compare la imagen con los datos y corrija lo necesario."}
          </SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-6">
          {error ? (
            <div role="alert" className="grid gap-3 rounded-xl border p-6 text-center">
              <p className="text-sm">No pudimos cargar la factura. {error}</p>
              <Button variant="outline" size="lg" className="mx-auto h-11" onClick={() => invoiceId && load(invoiceId)}>
                Reintentar
              </Button>
            </div>
          ) : !detail || loading ? (
            <div className="grid gap-6 md:grid-cols-2" aria-busy>
              <Skeleton className="h-[60vh]" />
              <div className="grid content-start gap-3">
                {Array.from({ length: 8 }, (_, i) => (
                  <Skeleton key={i} className="h-11" />
                ))}
              </div>
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 md:items-start">
              <div className="md:sticky md:top-0">
                {detail.file?.contentType === "application/pdf" ? (
                  <div className="grid gap-2">
                    <iframe src={detail.file.url} title="PDF de la factura" className="h-[70vh] w-full rounded-xl border" />
                    <a href={detail.file.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm underline underline-offset-4">
                      <FileTextIcon className="size-4" aria-hidden /> Abrir PDF en otra pestaña
                    </a>
                  </div>
                ) : detail.file ? (
                  <a href={detail.file.url} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element -- SAS de lectura temporal */}
                    <img src={detail.file.url} alt="Foto de la factura" className="max-h-[75vh] w-full object-contain" />
                    <ExternalLinkIcon className="absolute top-2 right-2 size-4 text-muted-foreground" aria-hidden />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin archivo.</p>
                )}
              </div>

              <div className="grid gap-4">
                {detail.duplicate && (
                  <p role="alert" className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                    Posible duplicado: {detail.duplicate.uploadedBy} subió la misma factura el{" "}
                    {formatDate(detail.duplicate.createdAt)}.
                  </p>
                )}
                {detail.status === "rejected" && detail.rejectionReason && (
                  <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
                    Rechazada: {detail.rejectionReason}
                  </p>
                )}
                <InvoiceForm
                  key={detail.id + detail.status}
                  invoiceId={detail.id}
                  kind={detail.kind}
                  categories={detail.kind === "purchase" ? detail.categories : undefined}
                  initial={detail.initial}
                  confidences={detail.confirmedAt ? null : detail.confidences}
                  companyRtn={detail.companyRtn}
                  readOnly={!detail.canEdit}
                  submitLabel="Guardar correcciones"
                  onSaved={onSaved}
                  footer={
                    detail.canEdit ? (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {detail.status !== "validated" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            className="h-11"
                            disabled={validating}
                            onClick={() =>
                              startValidating(async () => {
                                const r = await validateBatch({ companyId, ids: [detail.id] });
                                if (!r.ok) return void toast.error(r.error.message);
                                if (r.data.skipped.length) return void toast.warning(r.data.skipped[0].reason);
                                toast.success("Factura validada");
                                router.refresh();
                                onOpenChange(false);
                              })
                            }
                          >
                            <CheckIcon /> {validating ? "Validando…" : "Marcar como validada"}
                          </Button>
                        )}
                        {detail.status !== "rejected" && (
                          <Button
                            type="button"
                            variant="outline"
                            size="lg"
                            className="h-11 text-destructive"
                            disabled={validating}
                            onClick={() => setRejectOpen(true)}
                          >
                            <XIcon /> Rechazar
                          </Button>
                        )}
                      </div>
                    ) : undefined
                  }
                />
                <InvoiceComments key={detail.id} invoiceId={detail.id} />
              </div>
            </div>
          )}
        </div>
      </SheetContent>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rechazar la factura {detail?.initial.numeroFactura ?? ""}</DialogTitle>
            <DialogDescription>Quien la subió verá el motivo y podrá corregirla.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-sheet">Motivo</Label>
            <Textarea
              id="motivo-sheet"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="P. ej.: la foto está borrosa, falta el CAI…"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="lg" className="h-11" />}>Cancelar</DialogClose>
            <Button
              variant="destructive"
              size="lg"
              className="h-11"
              disabled={validating || reason.trim().length < 3 || !detail}
              onClick={() =>
                detail &&
                startValidating(async () => {
                  const r = await rejectBatch({ companyId, ids: [detail.id], reason });
                  if (!r.ok) return void toast.error(r.error.message);
                  if (r.data.skipped.length) return void toast.warning(r.data.skipped[0].reason);
                  toast.success("Factura rechazada");
                  setRejectOpen(false);
                  setReason("");
                  router.refresh();
                  load(detail.id);
                })
              }
            >
              {validating ? "Rechazando…" : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
