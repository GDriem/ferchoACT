import { CalculatorIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/access";
import { listClients } from "@/lib/review";

export const metadata: Metadata = { title: "Revisión de facturas" };

export default function AccountantHome() {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      <FirstClient />
    </Suspense>
  );
}

async function FirstClient() {
  const user = await requireUser();
  if (!user.isAccountant) redirect("/app");
  const clients = await listClients();
  if (clients.length > 0) redirect(`/contador/${clients[0].id}`);
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      <CalculatorIcon className="size-8 text-muted-foreground" aria-hidden />
      <p className="text-sm text-muted-foreground">
        Aún no tiene clientes. Cuando una empresa lo invite como contador, aparecerá aquí.
      </p>
    </div>
  );
}
