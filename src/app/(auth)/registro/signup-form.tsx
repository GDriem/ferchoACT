"use client";

import { useActionState } from "react";
import { signup } from "@/app/actions/auth";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthSwitchLink, NextInput } from "../next-param";

export function SignupForm() {
  const [state, action, pending] = useActionState(signup, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>Después podrá registrar su empresa o unirse a una.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <NextInput />
          <FormField
            name="name"
            label="Nombre completo"
            autoComplete="name"
            required
            errors={state?.fieldErrors?.name}
          />
          <FormField
            name="email"
            label="Correo"
            type="email"
            autoComplete="email"
            required
            errors={state?.fieldErrors?.email}
          />
          <FormField
            name="password"
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            hint="Mínimo 8 caracteres."
            errors={state?.fieldErrors?.password}
          />
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" name="isAccountant" className="size-5 accent-primary" />
            Soy contador y voy a recibir facturas de mis clientes
          </label>
          {state?.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11" disabled={pending}>
            {pending ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tiene cuenta?{" "}
            <AuthSwitchLink href="/ingresar">Ingrese</AuthSwitchLink>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
