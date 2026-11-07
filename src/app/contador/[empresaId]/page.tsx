import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { currentPeriodParam } from "@/lib/review";

/** /contador/[empresaId] → mes actual en Honduras. */
export default function CompanyRedirect({ params }: PageProps<"/contador/[empresaId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-40" />}>
      {params.then(({ empresaId }) => (
        <ToCurrentMonth companyId={empresaId} />
      ))}
    </Suspense>
  );
}

async function ToCurrentMonth({ companyId }: { companyId: string }): Promise<never> {
  await connection();
  redirect(`/contador/${companyId}/${currentPeriodParam()}`);
}
