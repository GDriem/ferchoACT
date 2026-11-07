import { Building2Icon, CalculatorIcon, MailIcon, UserIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ForbiddenError } from "@/lib/auth/access";
import { formatDate } from "@/lib/format";
import { getCompanyDetail } from "@/lib/invitations";
import { formatRtn } from "@/lib/validation/rtn";
import { InviteForm } from "./invite-form";
import { RevokeButton } from "./revoke-button";

export const metadata: Metadata = { title: "Empresa" };

export default function CompanyPage({ params }: PageProps<"/app/empresas/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      {params.then(({ id }) => (
        <CompanyDetail id={id} />
      ))}
    </Suspense>
  );
}

function DetailSkeleton() {
  return (
    <div className="grid gap-6" aria-busy>
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-40" />
      <Skeleton className="h-32" />
    </div>
  );
}

/** Ficha de la empresa. Sin acceso se responde 404 para no revelar que existe. */
async function loadDetail(id: string) {
  if (!z.guid().safeParse(id).success) notFound();
  try {
    return await getCompanyDetail(id);
  } catch (e) {
    if (e instanceof ForbiddenError) notFound();
    throw e;
  }
}

const kindLabel = { member: "Miembro", accountant: "Contador" } as const;

async function CompanyDetail({ id }: { id: string }) {
  const { company, members, accountants, pending, canManage, via } = await loadDetail(id);

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Building2Icon className="size-5 text-muted-foreground" />
            {company.legalName}
          </h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            RTN {formatRtn(company.rtn)}
            {company.tradeName && ` · ${company.tradeName}`}
          </p>
        </div>
        {via === "accountant" ? (
          <Link href={`/contador/${company.id}`} className={buttonVariants({ size: "lg", className: "h-11" })}>
            Revisar facturas
          </Link>
        ) : (
          <Link href="/app/facturas" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11" })}>
            Mis facturas
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Equipo</CardTitle>
          <CardDescription>Personas que suben facturas de esta empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2.5">
                <UserIcon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                <Badge variant={m.role === "owner" ? "default" : "secondary"}>
                  {m.role === "owner" ? "Dueño" : "Miembro"}
                </Badge>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contador</CardTitle>
          <CardDescription>Revisa las facturas y prepara la declaración del SAR.</CardDescription>
        </CardHeader>
        <CardContent>
          {accountants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {canManage
                ? "Aún no hay contador vinculado. Invítelo con el formulario de abajo."
                : "Aún no hay contador vinculado."}
            </p>
          ) : (
            <ul className="divide-y">
              {accountants.map((a) => (
                <li key={a.id} className="flex items-center gap-3 py-2.5">
                  <CalculatorIcon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canManage && (
        <>
          <InviteForm companyId={company.id} />

          <Card>
            <CardHeader>
              <CardTitle>Invitaciones pendientes</CardTitle>
              <CardDescription>
                Cada enlace sirve una sola vez y vence a los 7 días. Si lo perdió, anúlelo y cree otro.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay invitaciones pendientes.</p>
              ) : (
                <ul className="divide-y">
                  {pending.map((inv) => (
                    <li key={inv.id} className="flex items-center gap-3 py-2">
                      <MailIcon className="size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {kindLabel[inv.kind]}
                          {inv.email ? ` · ${inv.email}` : " · enlace abierto"}
                        </p>
                        <p className="text-xs text-muted-foreground">Vence el {formatDate(inv.expiresAt)}</p>
                      </div>
                      <RevokeButton companyId={company.id} invitationId={inv.id} label={kindLabel[inv.kind]} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
