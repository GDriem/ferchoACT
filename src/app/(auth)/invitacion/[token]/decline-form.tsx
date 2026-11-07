"use client";

import { useActionState } from "react";
import { declineInvitation } from "@/app/actions/invitations";
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

export function DeclineForm({ token, companyName }: { token: string; companyName: string }) {
  const [state, action, pending] = useActionState(declineInvitation, undefined);
  return (
    <div className="grid gap-2">
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="ghost" size="lg" className="h-11" disabled={pending} />}>
          Rechazar invitación
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Rechazar la invitación de {companyName}?</AlertDialogTitle>
            <AlertDialogDescription>
              El enlace deja de servir. Si cambia de opinión, pida que le envíen uno nuevo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <form action={action}>
              <input type="hidden" name="token" value={token} />
              <AlertDialogAction type="submit" variant="destructive" disabled={pending}>
                {pending ? "Rechazando…" : "Rechazar"}
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
    </div>
  );
}
