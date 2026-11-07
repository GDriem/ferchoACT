import { CheckCircle2Icon, CircleDashedIcon, LockIcon, ScanSearchIcon, XCircleIcon } from "lucide-react";
import type { InvoiceStatus } from "@/db/schema";
import { cn } from "@/lib/utils";

export const invoiceStatusLabel: Record<InvoiceStatus, string> = {
  processing: "Procesando",
  needs_review: "Por revisar",
  validated: "Validada",
  declared: "Declarada",
  rejected: "Rechazada",
};

const styles: Record<InvoiceStatus, { className: string; Icon: typeof CheckCircle2Icon }> = {
  processing: { className: "bg-muted text-muted-foreground", Icon: CircleDashedIcon },
  needs_review: { className: "bg-amber-500/15 text-amber-800 dark:text-amber-300", Icon: ScanSearchIcon },
  validated: { className: "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300", Icon: CheckCircle2Icon },
  declared: { className: "bg-sky-500/15 text-sky-800 dark:text-sky-300", Icon: LockIcon },
  rejected: { className: "bg-destructive/10 text-destructive", Icon: XCircleIcon },
};

/** Estado de una factura: color, icono y texto (nunca solo color). */
export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  const { className: tone, Icon } = styles[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      <Icon className={cn("size-3.5", status === "processing" && "animate-spin [animation-duration:3s]")} aria-hidden />
      {invoiceStatusLabel[status]}
    </span>
  );
}
