"use client";

import { KeyRoundIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { linkAccountant, previewAccountant } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Vincular al contador con su código (alternativa al enlace). Primero se
 * muestra a quién pertenece el código y el dueño confirma.
 */
export function LinkAccountantForm({ companyId }: { companyId: string }) {
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<{ name: string; email: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function lookup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await previewAccountant({ companyId, code });
      if (r.ok) setPreview(r.data);
      else setError(r.error.message);
    });
  }

  function confirm() {
    startTransition(async () => {
      const r = await linkAccountant({ companyId, code });
      if (!r.ok) {
        setPreview(null);
        return setError(r.error.message);
      }
      toast.success(`${r.data.name} quedó vinculado como su contador`);
      setPreview(null);
      setCode("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden /> Vincular contador con código
        </CardTitle>
        <CardDescription>Pídale a su contador el código que aparece en su perfil.</CardDescription>
      </CardHeader>
      <CardContent>
        {preview ? (
          <div className="grid gap-3" aria-live="polite">
            <p className="text-sm">
              El código es de <span className="font-medium">{preview.name}</span>{" "}
              <span className="text-muted-foreground">({preview.email})</span>. Podrá ver y revisar todas las facturas
              de esta empresa.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="lg" className="h-11" disabled={pending} onClick={confirm}>
                {pending ? "Vinculando…" : `Vincular a ${preview.name}`}
              </Button>
              <Button type="button" size="lg" variant="outline" className="h-11" disabled={pending} onClick={() => setPreview(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={lookup} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="accountant-code">Código del contador</Label>
              <Input
                id="accountant-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="K7QM-4XPA"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={12}
                className="h-11 font-mono tracking-widest"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? "accountant-code-error" : undefined}
              />
            </div>
            <Button type="submit" size="lg" variant="outline" className="h-11" disabled={pending || code.trim().length < 8}>
              {pending ? "Buscando…" : "Buscar"}
            </Button>
            {error && (
              <p id="accountant-code-error" className="text-xs text-destructive sm:col-span-2">
                {error}
              </p>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
