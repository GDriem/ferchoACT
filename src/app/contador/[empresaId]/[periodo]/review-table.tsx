"use client";

import {
  columnFilteringFeature,
  createColumnHelper,
  createFilteredRowModel,
  createSortedRowModel,
  filterFn_equals,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_alphanumeric,
  sortFn_basic,
  sortFn_text,
  tableFeatures,
  useTable,
  type ColumnFiltersState,
  type FilterFn,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import Decimal from "decimal.js";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, CheckIcon, ReceiptTextIcon, SearchIcon, XIcon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { moveBatch, rejectBatch, validateBatch } from "@/app/actions/review";
import { InvoiceStatusBadge, invoiceStatusLabel } from "@/components/invoice-status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { InvoiceStatus } from "@/db/schema";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatRtn } from "@/lib/validation/rtn";
import { InvoiceSheet } from "./invoice-sheet";

export type ReviewRow = {
  id: string;
  status: InvoiceStatus;
  fechaEmision: string | null;
  razonSocialEmisor: string | null;
  rtnEmisor: string | null;
  nombreComprador: string | null;
  rtnComprador: string | null;
  categoryName: string | null;
  numeroFactura: string | null;
  importeGravado15: string;
  importeGravado18: string;
  isv15: string;
  isv18: string;
  total: string;
  rejectionReason: string | null;
  confirmedAt: string | null;
  createdAt: string;
  uploadedBy: string;
  hasPeriod: boolean;
};

type Option = { value: string; label: string };
type BatchResult = Awaited<ReturnType<typeof validateBatch>>;

const gravado = (r: ReviewRow) => new Decimal(r.importeGravado15).plus(r.importeGravado18).toFixed(2);
const isv = (r: ReviewRow) => new Decimal(r.isv15).plus(r.isv18).toFixed(2);

// Funciones y modelos registrados explícitamente (TanStack Table v9)
const features = tableFeatures({
  rowSortingFeature,
  columnFilteringFeature,
  rowSelectionFeature,
  sortedRowModel: createSortedRowModel(),
  filteredRowModel: createFilteredRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, text: sortFn_text, basic: sortFn_basic },
  filterFns: { equals: filterFn_equals },
});
const helper = createColumnHelper<typeof features, ReviewRow>();

// Busca por RTN (con o sin guiones) o por número de factura
const rtnOrNumber: FilterFn<typeof features, ReviewRow> = (row, _col, value: string) => {
  const q = value.replace(/[\s-]/g, "");
  if (!q) return true;
  const r = row.original;
  return [r.rtnEmisor, r.rtnComprador, r.numeroFactura?.replace(/-/g, "")].some((v) => v?.includes(q));
};

type Kind = "purchase" | "sale";

function SortHeader({ label, column, align }: { label: string; column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc?: boolean) => void }; align?: "right" }) {
  const sorted = column.getIsSorted();
  const Icon = sorted === "asc" ? ArrowUpIcon : sorted === "desc" ? ArrowDownIcon : ArrowUpDownIcon;
  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(sorted === "asc")}
      className={cn("inline-flex h-9 items-center gap-1 font-medium hover:text-foreground", align === "right" && "ml-auto")}
      aria-label={`Ordenar por ${label}`}
    >
      {label}
      <Icon className={cn("size-3.5", !sorted && "text-muted-foreground/60")} aria-hidden />
    </button>
  );
}

// En compras se muestra el proveedor y la categoría; en ventas, el cliente
const buildColumns = (kind: Kind) => helper.columns([
  helper.display({
    id: "select",
    header: ({ table }) => (
      <Checkbox
        aria-label="Seleccionar todas"
        checked={table.getIsAllPageRowsSelected()}
        indeterminate={table.getIsSomePageRowsSelected()}
        onCheckedChange={(v) => table.toggleAllPageRowsSelected(!!v)}
        disabled={!table.options.enableRowSelection}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label={`Seleccionar factura ${row.original.numeroFactura ?? ""}`}
        checked={row.getIsSelected()}
        onCheckedChange={(v) => row.toggleSelected(!!v)}
        onClick={(e) => e.stopPropagation()}
        disabled={!row.getCanSelect()}
      />
    ),
  }),
  helper.accessor("fechaEmision", {
    header: ({ column }) => <SortHeader label="Fecha" column={column} />,
    cell: ({ row }) => <span className="tabular-nums">{formatDate(row.original.fechaEmision)}</span>,
    sortFn: "alphanumeric",
    sortUndefined: "last",
  }),
  helper.accessor((r) => (kind === "sale" ? (r.nombreComprador ?? "Consumidor final") : r.razonSocialEmisor), {
    id: "party",
    header: ({ column }) => <SortHeader label={kind === "sale" ? "Cliente" : "Proveedor"} column={column} />,
    cell: ({ getValue }) => {
      const v = getValue();
      return (
        <span className="block max-w-56 truncate" title={v ?? undefined}>
          {v ?? <span className="text-muted-foreground">—</span>}
        </span>
      );
    },
    sortFn: "text",
    sortUndefined: "last",
  }),
  helper.accessor((r) => (kind === "sale" ? r.rtnComprador : r.rtnEmisor), {
    id: "rtn",
    header: ({ column }) => <SortHeader label="RTN" column={column} />,
    cell: ({ getValue }) => {
      const v = getValue();
      return <span className="tabular-nums">{v ? formatRtn(v) : "—"}</span>;
    },
    filterFn: rtnOrNumber,
    sortFn: "alphanumeric",
    sortUndefined: "last",
  }),
  ...(kind === "purchase"
    ? [
        helper.accessor("categoryName", {
          header: ({ column }) => <SortHeader label="Categoría" column={column} />,
          cell: ({ row }) =>
            row.original.categoryName ?? <span className="text-amber-700 dark:text-amber-400">Sin categoría</span>,
          sortFn: "text",
          sortUndefined: "last",
        }),
      ]
    : []),
  helper.accessor("numeroFactura", {
    header: ({ column }) => <SortHeader label="N.º factura" column={column} />,
    cell: ({ row }) => <span className="tabular-nums">{row.original.numeroFactura ?? "—"}</span>,
    sortFn: "alphanumeric",
    sortUndefined: "last",
  }),
  helper.accessor((r) => Number(gravado(r)), {
    id: "gravado",
    header: ({ column }) => <SortHeader label="Gravado" column={column} align="right" />,
    cell: ({ row }) => <Money value={gravado(row.original)} />,
    sortFn: "basic",
  }),
  helper.accessor((r) => Number(isv(r)), {
    id: "isv",
    header: ({ column }) => <SortHeader label="ISV" column={column} align="right" />,
    cell: ({ row }) => <Money value={isv(row.original)} />,
    sortFn: "basic",
  }),
  helper.accessor((r) => Number(r.total), {
    id: "total",
    header: ({ column }) => <SortHeader label="Total" column={column} align="right" />,
    cell: ({ row }) => <Money value={row.original.total} strong />,
    sortFn: "basic",
  }),
  helper.accessor("status", {
    header: ({ column }) => <SortHeader label="Estado" column={column} />,
    filterFn: "equals",
    sortFn: "text",
    cell: ({ row }) => (
      <div className="grid gap-0.5">
        <InvoiceStatusBadge status={row.original.status} />
        {row.original.status === "needs_review" && !row.original.confirmedAt && (
          <span className="text-xs text-muted-foreground">Sin confirmar</span>
        )}
        {!row.original.hasPeriod && row.original.status !== "processing" && (
          <span className="text-xs text-muted-foreground">Sin período</span>
        )}
      </div>
    ),
  }),
  helper.accessor("uploadedBy", {
    header: ({ column }) => <SortHeader label="Subida por" column={column} />,
    sortFn: "text",
  }),
]);

export function ReviewTable({
  companyId,
  periodo,
  months,
  rows,
  readOnly,
  kind,
}: {
  companyId: string;
  periodo: string;
  months: Option[];
  rows: ReviewRow[];
  readOnly?: boolean;
  kind: Kind;
}) {
  const columns = useMemo(() => buildColumns(kind), [kind]);
  const [sorting, setSorting] = useState<SortingState>([{ id: "fechaEmision", desc: false }]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [status, setStatus] = useState<"all" | InvoiceStatus>("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"reject" | "move" | null>(null);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState<string>(months.find((m) => m.value !== periodo)?.value ?? periodo);
  const [pending, startTransition] = useTransition();


  // Filtros derivados de los controles; la tabla no los modifica por su cuenta
  const columnFilters: ColumnFiltersState = [
    ...(status === "all" ? [] : [{ id: "status", value: status }]),
    ...(search.trim() ? [{ id: "rtn", value: search }] : []),
  ];

  const table = useTable({
    features,
    columns,
    data: rows,
    state: { sorting, rowSelection, columnFilters },
    getRowId: (r) => r.id,
    enableRowSelection: !readOnly,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
  });

  // Solo las seleccionadas que siguen visibles con el filtro actual
  const selectedIds = table.getFilteredSelectedRowModel().rows.map((r) => r.id);

  function report(result: BatchResult, verb: string) {
    if (!result.ok) {
      toast.error(result.error.message);
      return;
    }
    const { updated, skipped } = result.data;
    if (updated) toast.success(`${updated} ${updated === 1 ? "factura" : "facturas"} ${verb}`);
    if (skipped.length) {
      toast.warning(`${skipped.length} sin cambios`, {
        description: [...new Set(skipped.map((s) => s.reason))].join(" "),
      });
    }
    setRowSelection({});
    setDialog(null);
    setReason("");
  }

  const statuses = Object.entries(invoiceStatusLabel) as [InvoiceStatus, string][];

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative w-full max-w-xs">
          <Label htmlFor="buscar" className="sr-only">
            Buscar por RTN o número
          </Label>
          <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="buscar"
            placeholder="Buscar por RTN o número"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 pl-9"
            inputMode="numeric"
          />
        </div>
        <Select
          value={status}
          items={[{ value: "all", label: "Todos los estados" }, ...statuses.map(([value, label]) => ({ value, label }))]}
          onValueChange={(v) => v && setStatus(v as typeof status)}
        >
          <SelectTrigger className="h-11 min-w-44" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {statuses.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {selectedIds.length > 0 && (
          <div className="ml-auto flex flex-wrap items-center gap-2" role="toolbar" aria-label="Acciones por lote">
            <span className="text-sm text-muted-foreground tabular-nums">{selectedIds.length} seleccionadas</span>
            <Button
              size="lg"
              className="h-11"
              disabled={pending}
              onClick={() =>
                startTransition(async () => report(await validateBatch({ companyId, ids: selectedIds }), "validadas"))
              }
            >
              <CheckIcon /> Validar
            </Button>
            <Button size="lg" variant="outline" className="h-11" disabled={pending} onClick={() => setDialog("reject")}>
              <XIcon /> Rechazar
            </Button>
            <Button size="lg" variant="outline" className="h-11" disabled={pending} onClick={() => setDialog("move")}>
              Mover de período
            </Button>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center gap-2 rounded-xl border border-dashed p-10 text-center">
          <ReceiptTextIcon className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            No hay {kind === "sale" ? "ventas" : "compras ni gastos"} en este mes. Cuando el cliente las suba, aparecerán aquí.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h) => (
                    <TableHead
                      key={h.id}
                      className={cn(["gravado", "isv", "total"].includes(h.column.id) && "text-right")}
                      aria-sort={
                        h.column.getIsSorted() === "asc" ? "ascending" : h.column.getIsSorted() === "desc" ? "descending" : undefined
                      }
                    >
                      <table.FlexRender header={h} />
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={table.getAllLeafColumns().length} className="h-24 text-center text-muted-foreground">
                    Ninguna factura coincide con el filtro.
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className="cursor-pointer"
                    tabIndex={0}
                    onClick={() => setOpenId(row.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setOpenId(row.id);
                    }}
                  >
                    {row.getAllCells().map((cell) => (
                      <TableCell key={cell.id}>
                        <table.FlexRender cell={cell} />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <InvoiceSheet
        invoiceId={openId}
        companyId={companyId}
        onOpenChange={(open) => !open && setOpenId(null)}
      />

      <Dialog open={dialog === "reject"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Rechazar {selectedIds.length} {selectedIds.length === 1 ? "factura" : "facturas"}
            </DialogTitle>
            <DialogDescription>Quien la subió verá el motivo y podrá corregirla.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <Textarea
              id="motivo"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="P. ej.: la foto está borrosa, falta el CAI…"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="lg" className="h-11" />}>Cancelar</DialogClose>
            <Button
              variant="destructive"
              size="lg"
              className="h-11"
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                startTransition(async () => report(await rejectBatch({ companyId, ids: selectedIds, reason }), "rechazadas"))
              }
            >
              {pending ? "Rechazando…" : "Rechazar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "move"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mover de período</DialogTitle>
            <DialogDescription>
              Las facturas se declararán en el mes que elija. El cambio queda registrado.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <Label htmlFor="destino">Mes de destino</Label>
            <Select value={target} items={months} onValueChange={(v) => v && setTarget(v)}>
              <SelectTrigger id="destino" className="h-11 w-full">
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
          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="lg" className="h-11" />}>Cancelar</DialogClose>
            <Button
              size="lg"
              className="h-11"
              disabled={pending || target === periodo}
              onClick={() =>
                startTransition(async () =>
                  report(await moveBatch({ companyId, ids: selectedIds, period: target }), "movidas"),
                )
              }
            >
              {pending ? "Moviendo…" : "Mover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Money({ value, strong }: { value: string; strong?: boolean }) {
  return <span className={cn("block text-right tabular-nums", strong && "font-medium")}>{formatMoney(value)}</span>;
}
