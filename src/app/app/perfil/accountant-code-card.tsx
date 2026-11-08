"use client";

import { CalculatorIcon, CheckIcon, CopyIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { becomeAccountant } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Código para que una empresa vincule al contador sin enlace. */
export function AccountantCodeCard({ code }: { code: string | null }) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Código copiado");
    } catch {
      toast.error("No se pudo copiar. Selecciónelo y cópielo a mano.");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalculatorIcon className="size-4 text-muted-foreground" aria-hidden /> Código de contador
        </CardTitle>
        <CardDescription>
          {code
            ? "Compártalo con sus clientes. Lo escriben en la ficha de su empresa y usted queda vinculado."
            : "¿Es contador? Active su código y compártalo con sus clientes para que lo vinculen a su empresa."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {code ? (
          <div className="flex flex-wrap items-center gap-3">
            <output
              aria-label="Su código de contador"
              className="rounded-lg border bg-muted/40 px-4 py-2 font-mono text-2xl font-semibold tracking-widest select-all"
            >
              {code}
            </output>
            <Button type="button" size="lg" variant="outline" className="h-11" onClick={() => copy(code)}>
              {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Copiado" : "Copiar"}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            size="lg"
            className="h-11"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const r = await becomeAccountant();
                if (!r.ok) toast.error(r.error.message);
                else toast.success("Código activado");
              })
            }
          >
            {pending ? "Activando…" : "Soy contador: activar mi código"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
