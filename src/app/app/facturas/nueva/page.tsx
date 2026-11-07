import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { companies, companyMembers } from "@/db/schema";
import { requireUser } from "@/lib/auth/access";
import { Scanner } from "./scanner";

export const metadata: Metadata = { title: "Escanear factura" };

export default function ScanPage() {
  return (
    <div className="mx-auto grid w-full max-w-md gap-4">
      <h1 className="text-xl font-semibold">Escanear factura</h1>
      <Suspense fallback={<Skeleton className="h-72" />}>
        <ScanContent />
      </Suspense>
    </div>
  );
}

async function ScanContent() {
  const user = await requireUser();
  const memberOf = await db
    .select({ id: companies.id, legalName: companies.legalName })
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(eq(companyMembers.userId, user.id))
    .orderBy(companies.legalName);

  if (memberOf.length === 0) {
    return (
      <div className="grid gap-3 rounded-xl border p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Para subir facturas primero registre su empresa o pida que lo inviten.
        </p>
        <Link href="/app/empresas/nueva" className={buttonVariants({ size: "lg", className: "h-11" })}>
          Registrar empresa
        </Link>
      </div>
    );
  }
  return <Scanner companies={memberOf} />;
}
