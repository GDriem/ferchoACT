"use client";

import { Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { discardInvoice } from "@/app/actions/invoices";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Elimina la factura y su archivo. Solo quien la subió, antes de que el contador la valide. */
export function DiscardButton({ invoiceId, label }: { invoiceId: string; label: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const name = label ? `la factura ${label}` : "esta factura";
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="outline" size="lg" className="h-11 text-destructive" />}>
        <Trash2Icon /> Eliminar factura
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Se borran la foto o el PDF y los datos que haya escrito. Esto no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await discardInvoice(invoiceId);
                if (r.ok) return;
                toast.error(r.error.message);
                // Si el contador la validó, la página se actualiza y el botón desaparece
                router.refresh();
              })
            }
          >
            {pending ? "Eliminando…" : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
