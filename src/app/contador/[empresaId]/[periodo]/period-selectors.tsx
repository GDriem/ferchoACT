"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Option = { value: string; label: string };

/** Empresa y mes siempre visibles; el cambio queda en la URL. */
export function PeriodSelectors({
  companyId,
  periodo,
  tipo,
  companies,
  months,
}: {
  companyId: string;
  periodo: string;
  /** Pestaña actual ("ventas"); se conserva al cambiar de empresa o mes. */
  tipo?: string;
  companies: Option[];
  months: Option[];
}) {
  const router = useRouter();
  const query = tipo ? `?tipo=${tipo}` : "";
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="empresa">Empresa</Label>
        <Select
          value={companyId}
          items={companies}
          onValueChange={(v) => v && router.push(`/contador/${v}/${periodo}${query}`)}
        >
          <SelectTrigger id="empresa" className="h-11 min-w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {companies.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mes">Mes</Label>
        <Select value={periodo} items={months} onValueChange={(v) => v && router.push(`/contador/${companyId}/${v}${query}`)}>
          <SelectTrigger id="mes" className="h-11 min-w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {months.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
