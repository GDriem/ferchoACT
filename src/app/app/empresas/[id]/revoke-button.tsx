"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { revokeInvitation } from "@/app/actions/invitations";
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

export function RevokeButton({
  companyId,
  invitationId,
  label,
}: {
  companyId: string;
  invitationId: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      await revokeInvitation(companyId, invitationId);
      setOpen(false);
      toast.success("Invitación anulada");
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="lg" className="h-11" />}>
        Anular
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Anular la invitación de {label.toLowerCase()}?</AlertDialogTitle>
          <AlertDialogDescription>
            El enlace dejará de funcionar. Si lo necesita, puede crear uno nuevo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={revoke} disabled={pending}>
            {pending ? "Anulando…" : "Anular invitación"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
