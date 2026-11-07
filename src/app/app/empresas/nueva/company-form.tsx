"use client";

import { useActionState } from "react";
import { createCompany } from "@/app/actions/companies";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function CompanyForm() {
  const [state, action, pending] = useActionState(createCompany, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Registrar empresa</CardTitle>
        <CardDescription>Quedará como dueño y podrá invitar a su equipo y a su contador.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <FormField
            name="legalName"
            label="Razón social"
            autoComplete="organization"
            required
            errors={state?.fieldErrors?.legalName}
          />
          <FormField
            name="tradeName"
            label="Nombre comercial (opcional)"
            errors={state?.fieldErrors?.tradeName}
          />
          <FormField
            name="rtn"
            label="RTN"
            inputMode="numeric"
            placeholder="0801-1990-123456"
            required
            hint="14 dígitos, con o sin guiones."
            errors={state?.fieldErrors?.rtn}
          />
          {state?.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11" disabled={pending}>
            {pending ? "Registrando…" : "Registrar empresa"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
