"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useActionState, useState } from "react";
import { toast } from "sonner";
import { createInvitation } from "@/app/actions/invitations";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const kinds = [
  { value: "member", label: "Miembro del equipo", hint: "Podrá escanear y subir facturas." },
  { value: "accountant", label: "Mi contador", hint: "Verá la empresa en «Mis clientes»." },
] as const;

export function InviteForm({ companyId }: { companyId: string }) {
  const [state, action, pending] = useActionState(createInvitation, undefined);
  const [kind, setKind] = useState<(typeof kinds)[number]["value"]>("member");
  const [copied, setCopied] = useState(false);

  async function copy(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Enlace copiado");
    } catch {
      toast.error("No se pudo copiar. Seleccione el enlace y cópielo a mano.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitar</CardTitle>
        <CardDescription>
          Se genera un enlace de un solo uso. Compártalo por WhatsApp o correo.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={action} className="grid gap-4" onSubmit={() => setCopied(false)}>
          <input type="hidden" name="companyId" value={companyId} />
          <input type="hidden" name="kind" value={kind} />
          <fieldset className="grid gap-2">
            <legend className="mb-1.5 text-sm font-medium">¿A quién invita?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {kinds.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  role="radio"
                  aria-checked={kind === k.value}
                  onClick={() => setKind(k.value)}
                  className={cn(
                    "grid min-h-11 gap-0.5 rounded-lg border p-3 text-left transition-colors",
                    kind === k.value ? "border-primary bg-primary/5" : "hover:bg-muted",
                  )}
                >
                  <span className="text-sm font-medium">{k.label}</span>
                  <span className="text-xs text-muted-foreground">{k.hint}</span>
                </button>
              ))}
            </div>
          </fieldset>
          <FormField
            name="email"
            label="Correo (opcional)"
            type="email"
            autoComplete="off"
            hint="Si lo escribe, solo esa cuenta podrá usar el enlace."
            errors={state?.fieldErrors?.email}
          />
          {state?.message && (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
          <Button type="submit" size="lg" className="h-11" disabled={pending}>
            {pending ? "Generando…" : "Generar enlace de invitación"}
          </Button>
        </form>

        {state?.link && (
          <div className="grid gap-1.5 rounded-lg border bg-muted/40 p-3" aria-live="polite">
            <Label htmlFor="invite-link">Enlace de invitación</Label>
            <div className="flex gap-2">
              <Input
                id="invite-link"
                readOnly
                value={state.link}
                className="h-11 font-mono text-xs"
                onFocus={(e) => e.currentTarget.select()}
              />
              <Button type="button" size="lg" className="h-11" onClick={() => copy(state.link!)}>
                {copied ? <CheckIcon /> : <CopyIcon />}
                {copied ? "Copiado" : "Copiar"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {state.delivered && "También se envió por correo. "}
              Este enlace solo se muestra ahora. Vence en 7 días.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
