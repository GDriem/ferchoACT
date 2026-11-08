import { eq } from "drizzle-orm";
import { Building2Icon, ChevronRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { removeAvatar, uploadAvatar } from "@/app/actions/profile";
import { ImagePicker } from "@/components/image-picker";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/db";
import { companies, companyMembers } from "@/db/schema";
import { getProfile } from "@/lib/profile";
import { formatRtn } from "@/lib/validation/rtn";
import { AccountantCodeCard } from "./accountant-code-card";
import { NameForm } from "./name-form";

export const metadata: Metadata = { title: "Mi perfil" };

export default function ProfilePage() {
  return (
    <div className="mx-auto grid w-full max-w-2xl gap-6">
      <h1 className="text-xl font-semibold">Mi perfil</h1>
      <Suspense fallback={<ProfileSkeleton />}>
        <Profile />
      </Suspense>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="grid gap-6" aria-busy>
      <Skeleton className="h-48" />
      <Skeleton className="h-36" />
      <Skeleton className="h-36" />
    </div>
  );
}

async function Profile() {
  const profile = await getProfile();
  const memberOf = await db
    .select({ id: companies.id, legalName: companies.legalName, rtn: companies.rtn, role: companyMembers.role })
    .from(companyMembers)
    .innerJoin(companies, eq(companyMembers.companyId, companies.id))
    .where(eq(companyMembers.userId, profile.id))
    .orderBy(companies.legalName);

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
          <CardDescription>{profile.email}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ImagePicker name={profile.name} url={profile.avatarUrl} label="Foto" savedMessage="Foto actualizada" upload={uploadAvatar} remove={removeAvatar} />
          <NameForm name={profile.name} />
        </CardContent>
      </Card>

      <AccountantCodeCard code={profile.accountantCode} />

      <Card>
        <CardHeader>
          <CardTitle>Mis empresas</CardTitle>
          <CardDescription>Logo, equipo, contador y categorías de cada empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          {memberOf.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Todavía no pertenece a ninguna empresa.{" "}
              <Link href="/app/empresas/nueva" className="font-medium underline underline-offset-4">
                Registrar empresa
              </Link>
            </p>
          ) : (
            <ul className="divide-y">
              {memberOf.map((c) => (
                <li key={c.id}>
                  <Link href={`/app/empresas/${c.id}`} className="flex min-h-14 items-center gap-3 py-2 hover:text-foreground">
                    <Building2Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.legalName}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">RTN {formatRtn(c.rtn)}</p>
                    </div>
                    <Badge variant="secondary">{c.role === "owner" ? "Dueño" : "Miembro"}</Badge>
                    <ChevronRightIcon className="size-4 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
