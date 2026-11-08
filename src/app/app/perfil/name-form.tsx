"use client";

import { useActionState } from "react";
import { updateName } from "@/app/actions/profile";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";

export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(updateName, undefined);
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <FormField name="name" label="Nombre" defaultValue={name} autoComplete="name" required errors={state?.fieldErrors?.name} />
      <Button type="submit" size="lg" variant="outline" className="h-11" disabled={pending}>
        {pending ? "Guardando…" : "Guardar nombre"}
      </Button>
      {state?.saved && (
        <p role="status" className="text-sm text-emerald-700 sm:col-span-2 dark:text-emerald-400">
          Nombre guardado.
        </p>
      )}
    </form>
  );
}
