"use client";

import { PlusIcon, TagsIcon, XIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addCategory, deleteCategory } from "@/app/actions/team";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Category = { id: string; name: string; custom: boolean };

/** Categorías de compras y gastos: la lista base más las propias de la empresa. */
export function CategoriesCard({
  companyId,
  categories,
  canManage,
}: {
  companyId: string;
  categories: Category[];
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const own = categories.filter((c) => c.custom);
  const base = categories.filter((c) => !c.custom);

  function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const r = await addCategory({ companyId, name });
      if (!r.ok) return setError(r.error.message);
      toast.success("Categoría agregada");
      setName("");
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TagsIcon className="size-4 text-muted-foreground" aria-hidden /> Categorías de compras y gastos
        </CardTitle>
        <CardDescription>
          Se eligen al confirmar cada factura de compra. El contador las usa para ordenar y sumar los gastos del mes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2">
          <h3 className="text-sm font-medium">Propias de la empresa</h3>
          {own.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canManage ? "Aún no hay. Agregue las que necesite abajo." : "Aún no hay."}
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {own.map((c) => (
                <li key={c.id} className="flex items-center gap-1 rounded-full border bg-primary/5 py-1 pr-1 pl-3 text-sm">
                  {c.name}
                  {canManage && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="rounded-full"
                      aria-label={`Quitar la categoría ${c.name}`}
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await deleteCategory({ companyId, categoryId: c.id });
                          if (!r.ok) toast.error(r.error.message);
                          else toast.success(`Se quitó «${c.name}». Las facturas que la usaban quedan sin categoría.`);
                        })
                      }
                    >
                      <XIcon />
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {canManage && (
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="new-category">Nueva categoría</Label>
              <Input
                id="new-category"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="P. ej.: Repuestos de vehículos"
                maxLength={80}
                className="h-11"
                aria-invalid={!!error || undefined}
                aria-describedby={error ? "new-category-error" : undefined}
              />
            </div>
            <Button type="submit" size="lg" variant="outline" className="h-11" disabled={pending || name.trim().length < 2}>
              <PlusIcon /> Agregar
            </Button>
            {error && (
              <p id="new-category-error" className="text-xs text-destructive sm:col-span-2">
                {error}
              </p>
            )}
          </form>
        )}

        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium">Lista base ({base.length})</summary>
          <p className="text-muted-foreground">{base.map((c) => c.name).join(" · ")}</p>
        </details>
      </CardContent>
    </Card>
  );
}
