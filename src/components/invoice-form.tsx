"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertTriangleIcon } from "lucide-react";
import { startTransition, useActionState, useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { saveInvoice, type SaveInvoiceState } from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  invoiceConsistencyIssues,
  invoiceFieldsSchema,
  LOW_CONFIDENCE,
  normalizeMoney,
  type InvoiceField,
  type InvoiceFormValues as Values,
} from "@/lib/validation/invoice";
import { formatRtn, normalizeRtn } from "@/lib/validation/rtn";


type FieldDef = {
  name: InvoiceField;
  label: string;
  type?: "text" | "date";
  inputMode?: "numeric" | "decimal" | "text";
  placeholder?: string;
  hint?: string;
  money?: boolean;
};

const supplierSection = {
  title: "Proveedor",
  fields: [
    { name: "razonSocialEmisor", label: "Nombre o razón social" },
    { name: "rtnEmisor", label: "RTN del proveedor", inputMode: "numeric", placeholder: "0801-1990-123456" },
  ],
} satisfies { title: string; fields: FieldDef[] };

const clientSection = {
  title: "Cliente",
  fields: [
    { name: "nombreComprador", label: "Nombre del cliente (opcional)", hint: "Déjelo vacío si es consumidor final." },
    { name: "rtnComprador", label: "RTN del cliente (opcional)", inputMode: "numeric", placeholder: "0801-1990-123456" },
  ],
} satisfies { title: string; fields: FieldDef[] };

const purchaseSections: { title: string; fields: FieldDef[] }[] = [
  supplierSection,
  {
    title: "Documento",
    fields: [
      { name: "numeroFactura", label: "N.º de factura", inputMode: "numeric", placeholder: "000-001-01-00000123" },
      { name: "fechaEmision", label: "Fecha de emisión", type: "date" },
      { name: "cai", label: "CAI", placeholder: "XXXXXX-XXXXXX-XXXXXX-XXXXXX-XXXXXX-XX" },
      { name: "fechaLimiteEmision", label: "Fecha límite de emisión", type: "date" },
      { name: "rangoAutorizadoDesde", label: "Rango autorizado desde", inputMode: "numeric" },
      { name: "rangoAutorizadoHasta", label: "Rango autorizado hasta", inputMode: "numeric" },
      { name: "rtnComprador", label: "RTN del comprador (opcional)", inputMode: "numeric" },
    ],
  },
  {
    title: "Montos",
    fields: [
      { name: "importeExento", label: "Importe exento", money: true },
      { name: "importeExonerado", label: "Importe exonerado", money: true },
      { name: "importeGravado15", label: "Importe gravado 15 %", money: true },
      { name: "isv15", label: "ISV 15 %", money: true },
      { name: "importeGravado18", label: "Importe gravado 18 %", money: true },
      { name: "isv18", label: "ISV 18 %", money: true },
      { name: "total", label: "Total", money: true },
    ],
  },
];

// En una venta el emisor es la empresa (va oculto) y se pide el cliente
const saleSections: { title: string; fields: FieldDef[] }[] = [
  clientSection,
  ...purchaseSections.slice(1).map((section) => ({
    ...section,
    fields: section.fields.filter((f) => f.name !== "rtnComprador"),
  })),
];

const fullWidth: InvoiceField[] = ["razonSocialEmisor", "cai", "nombreComprador"];

export type InvoiceFormProps = {
  invoiceId: string;
  kind?: "purchase" | "sale";
  /** Categorías para compras; si no se pasan, no se muestra el campo. */
  categories?: { id: string; name: string }[];
  initial: Values;
  /** Confianza del OCR; si se pasa, los campos < 0.8 se resaltan. */
  confidences?: Partial<Record<InvoiceField, number>> | null;
  /** RTN de la empresa, para avisar si el comprador no coincide. */
  companyRtn?: string;
  submitLabel?: string;
  readOnly?: boolean;
  onSaved?: () => void;
  /** Se muestra en lugar del formulario después de guardar. */
  savedSlot?: React.ReactNode;
  footer?: React.ReactNode;
};

export function InvoiceForm({
  invoiceId,
  kind = "purchase",
  categories,
  initial,
  confidences,
  companyRtn,
  submitLabel = "Guardar factura",
  readOnly,
  onSaved,
  savedSlot,
  footer,
}: InvoiceFormProps) {
  const [state, action, pending] = useActionState<SaveInvoiceState, FormData>(saveInvoice, undefined);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, touchedFields, isSubmitted },
  } = useForm<Values>({
    resolver: zodResolver(invoiceFieldsSchema) as never,
    mode: "onTouched",
    defaultValues: initial,
  });

  useEffect(() => {
    if (state?.saved) onSaved?.();
  }, [state, onSaved]);

  // Cuadre en vivo (ISV, total, fechas, rango) con las mismas reglas que el servidor
  const values = useWatch({ control }) as Values;
  const liveIssues = useMemo(() => {
    const money = (v: string) => normalizeMoney(v ?? "") ?? "0";
    const issues = invoiceConsistencyIssues({
      importeExento: money(values.importeExento),
      importeExonerado: money(values.importeExonerado),
      importeGravado15: money(values.importeGravado15),
      importeGravado18: money(values.importeGravado18),
      isv15: money(values.isv15),
      isv18: money(values.isv18),
      total: money(values.total),
      fechaEmision: values.fechaEmision,
      fechaLimiteEmision: values.fechaLimiteEmision,
      numeroFactura: values.numeroFactura,
      rangoAutorizadoDesde: values.rangoAutorizadoDesde || null,
      rangoAutorizadoHasta: values.rangoAutorizadoHasta || null,
    });
    return Object.fromEntries(issues.map((i) => [i.field, i.message])) as Partial<Record<InvoiceField, string>>;
  }, [values]);

  if (state?.saved && savedSlot) return savedSlot;

  const sale = kind === "sale";
  const sections = sale ? saleSections : purchaseSections;
  const buyerMismatch =
    !sale && companyRtn && values.rtnComprador && normalizeRtn(values.rtnComprador) !== companyRtn
      ? `No coincide con el RTN de la empresa (${formatRtn(companyRtn)}). Sin él, el crédito fiscal puede no aplicar.`
      : undefined;

  const submit = handleSubmit((_values, event) => {
    const fd = new FormData(event?.target as HTMLFormElement);
    startTransition(() => action(fd));
  });

  return (
    <form onSubmit={submit} noValidate className="grid gap-6">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {sale && (
        <>
          {/* El servidor igual fija a la empresa como emisora */}
          <input type="hidden" {...register("rtnEmisor")} />
          <input type="hidden" {...register("razonSocialEmisor")} />
        </>
      )}
      <fieldset disabled={readOnly || pending} className="grid gap-6">
        {sections.map((section, i) => (
          <section key={section.title} className="grid gap-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{section.title}</h2>
            {i === 0 && !sale && categories && (
              <div className="grid gap-1.5">
                <Label htmlFor="categoryId">Categoría</Label>
                <Controller
                  control={control}
                  name="categoryId"
                  render={({ field }) => (
                    <Select
                      name="categoryId"
                      value={field.value || null}
                      onValueChange={(v) => field.onChange(v ?? "")}
                      items={categories.map((c) => ({ value: c.id, label: c.name }))}
                      disabled={readOnly || pending}
                    >
                      <SelectTrigger id="categoryId" className="h-11 w-full">
                        <SelectValue placeholder="Elija una categoría" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {(errors.categoryId?.message ?? state?.fieldErrors?.categoryId?.[0]) && (
                  <p className="text-xs text-destructive">{errors.categoryId?.message ?? state?.fieldErrors?.categoryId?.[0]}</p>
                )}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {section.fields.map((f) => {
                const confidence = confidences?.[f.name];
                const lowConfidence = confidence !== undefined && confidence < LOW_CONFIDENCE;
                const shownLive = touchedFields[f.name] || isSubmitted;
                const error =
                  errors[f.name]?.message ??
                  state?.fieldErrors?.[f.name]?.[0] ??
                  (shownLive ? liveIssues[f.name] : undefined);
                const warning = f.name === "rtnComprador" ? buyerMismatch : undefined;
                const errorId = `${f.name}-error`;
                const noteId = `${f.name}-note`;
                return (
                  <div key={f.name} className={cn("grid gap-1.5", fullWidth.includes(f.name) && "sm:col-span-2")}>
                    <Label htmlFor={f.name}>{f.label}</Label>
                    <div className="relative">
                      {f.money && (
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
                          L
                        </span>
                      )}
                      <Input
                        id={f.name}
                        type={f.type ?? "text"}
                        inputMode={f.money ? "decimal" : f.inputMode}
                        placeholder={f.placeholder ?? (f.money ? "0.00" : undefined)}
                        autoComplete="off"
                        className={cn(
                          "h-11",
                          f.money && "pl-7 text-right tabular-nums",
                          lowConfidence && !error && "border-amber-500 bg-amber-500/10 focus-visible:ring-amber-500/30",
                        )}
                        aria-invalid={!!error || undefined}
                        aria-describedby={[error && errorId, (lowConfidence || warning || f.hint) && noteId].filter(Boolean).join(" ") || undefined}
                        {...register(f.name as keyof Values)}
                      />
                    </div>
                    {error ? (
                      <p id={errorId} className="text-xs text-destructive">
                        {error}
                      </p>
                    ) : lowConfidence ? (
                      <p id={noteId} className="flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangleIcon className="size-3.5" aria-hidden /> Verifique este dato
                      </p>
                    ) : warning ? (
                      <p id={noteId} className="text-xs text-amber-700 dark:text-amber-400">
                        {warning}
                      </p>
                    ) : f.hint ? (
                      <p id={noteId} className="text-xs text-muted-foreground">
                        {f.hint}
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </fieldset>

      {state?.message && !state.saved && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      {state?.saved && !savedSlot && (
        <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
          Cambios guardados.
        </p>
      )}

      {!readOnly && (
        <Button type="submit" size="lg" className="h-12" disabled={pending}>
          {pending ? "Guardando…" : submitLabel}
        </Button>
      )}
      {footer}
    </form>
  );
}
