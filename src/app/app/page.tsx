import { eq } from "drizzle-orm";
import { Building2Icon, PlusIcon, ReceiptTextIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ScanFab } from "@/components/scan-fab";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { accountantClients, companies, companyMembers } from "@/db/schema";
import { requireUser } from "@/lib/auth/access";
import { formatRtn } from "@/lib/validation/rtn";

export const metadata: Metadata = { title: "Inicio" };

export default function AppHome() {
  return (
    <Suspense fallback={<HomeSkeleton />}>
      <HomeContent />
    </Suspense>
  );
}

function HomeSkeleton() {
  return (
    <div className="grid gap-3" aria-busy>
      <Skeleton className="h-7 w-40" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    </div>
  );
}

async function HomeContent() {
  const user = await requireUser();

  const memberOf = await db
    .select({ id: companies.id, legalName: companies.legalName, rtn: companies.rtn, role: companyMembers.role })
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(eq(companyMembers.userId, user.id))
    .orderBy(companies.legalName);

  const clients = user.isAccountant
    ? await db
        .select({ id: companies.id, legalName: companies.legalName, rtn: companies.rtn })
        .from(accountantClients)
        .innerJoin(companies, eq(accountantClients.companyId, companies.id))
        .where(eq(accountantClients.accountantId, user.id))
        .orderBy(companies.legalName)
    : [];

  return (
    <div className="grid gap-8">
      {user.isAccountant && (
        <section className="grid gap-3">
          <h1 className="text-xl font-semibold">Mis clientes</h1>
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aún no tiene clientes. Cuando una empresa lo invite como contador, aparecerá aquí.
            </p>
          ) : (
            <CompanyGrid items={clients.map((c) => ({ ...c, href: `/contador/${c.id}` }))} />
          )}
        </section>
      )}

      {memberOf.length > 0 && (
        <Link href="/app/facturas" className="flex min-h-11 items-center justify-between rounded-xl border px-4 py-3 text-sm font-medium hover:bg-muted/50">
          Mis facturas <ReceiptTextIcon className="size-4 text-muted-foreground" />
        </Link>
      )}

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-xl font-semibold">Mis empresas</h2>
          <Link href="/app/empresas/nueva" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11" })}>
            <PlusIcon /> Registrar empresa
          </Link>
        </div>
        {memberOf.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no pertenece a ninguna empresa. Registre la suya o pida que lo inviten.
          </p>
        ) : (
          <CompanyGrid
            items={memberOf.map((c) => ({ ...c, badge: c.role === "owner" ? "Dueño" : "Miembro" }))}
          />
        )}
      </section>
      {memberOf.length > 0 && <ScanFab />}
    </div>
  );
}

function CompanyGrid({
  items,
}: {
  items: { id: string; legalName: string; rtn: string; badge?: string; href?: string }[];
}) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            href={c.href ?? `/app/empresas/${c.id}`}
            className="block rounded-xl focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2Icon className="size-4 text-muted-foreground" />
                  {c.legalName}
                  {c.badge && <Badge variant="secondary">{c.badge}</Badge>}
                </CardTitle>
                <CardDescription className="tabular-nums">RTN {formatRtn(c.rtn)}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
