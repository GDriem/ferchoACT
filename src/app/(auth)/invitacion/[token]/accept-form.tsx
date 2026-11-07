"use client";

import { useActionState } from "react";
import { acceptInvitation } from "@/app/actions/invitations";
import { Button } from "@/components/ui/button";

export function AcceptForm({ token, userEmail }: { token: string; userEmail: string }) {
  const [state, action, pending] = useActionState(acceptInvitation, undefined);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <p className="text-sm text-muted-foreground">
        Va a aceptar como <span className="font-medium text-foreground">{userEmail}</span>.
      </p>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11" disabled={pending}>
        {pending ? "Aceptando…" : "Aceptar invitación"}
      </Button>
    </form>
  );
}
