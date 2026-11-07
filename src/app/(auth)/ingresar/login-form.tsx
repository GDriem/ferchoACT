"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AuthSwitchLink, NextInput } from "../next-param";

export function LoginForm() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ingresar</CardTitle>
        <CardDescription>Use el correo con el que se registró.</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} className="grid gap-4">
          <NextInput />
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
            autoComplete="current-password"
            required
            errors={state?.fieldErrors?.password}
          />
          {state?.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11" disabled={pending}>
            {pending ? "Ingresando…" : "Ingresar"}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿No tiene cuenta?{" "}
            <AuthSwitchLink href="/registro">Regístrese</AuthSwitchLink>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
