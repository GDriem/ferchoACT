import { CameraIcon, CheckCircle2Icon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export function SavedCard() {
  return (
    <div role="status" className="grid gap-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-6 text-center">
      <CheckCircle2Icon className="mx-auto size-10 text-emerald-700 dark:text-emerald-400" aria-hidden />
      <div className="grid gap-1">
        <p className="text-lg font-semibold">Factura guardada</p>
        <p className="text-sm text-muted-foreground">Su contador la verá en su lista para revisarla.</p>
      </div>
      <Link href="/app/facturas/nueva" className={buttonVariants({ size: "lg", className: "h-12" })}>
        <CameraIcon /> Escanear otra
      </Link>
      <Link href="/app/facturas" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11" })}>
        Ver mis facturas
      </Link>
    </div>
  );
}
