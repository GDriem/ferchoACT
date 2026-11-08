"use client";

import { UserMinusIcon } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { removeMember, unlinkAccountant } from "@/app/actions/team";
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

/** Quitar a un miembro del equipo o desvincular al contador (solo el dueño). */
export function RemovePersonButton({
  companyId,
  userId,
  name,
  kind,
}: {
  companyId: string;
  userId: string;
  name: string;
  kind: "member" | "accountant";
}) {
  const [pending, startTransition] = useTransition();
  const accountant = kind === "accountant";
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-lg" className="size-11" aria-label={`Quitar a ${name}`} />}
      >
        <UserMinusIcon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{accountant ? `¿Desvincular a ${name} como contador?` : `¿Quitar a ${name} del equipo?`}</AlertDialogTitle>
          <AlertDialogDescription>
            {accountant
              ? "Dejará de ver las facturas de la empresa. Puede volver a vincularlo con su código o un enlace."
              : "Ya no podrá subir facturas de esta empresa. Las que ya subió se conservan."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await (accountant ? unlinkAccountant : removeMember)({ companyId, userId });
                if (!r.ok) toast.error(r.error.message);
                else toast.success(accountant ? `${name} fue desvinculado` : `${name} salió del equipo`);
              })
            }
          >
            {pending ? "Quitando…" : accountant ? "Desvincular" : "Quitar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
