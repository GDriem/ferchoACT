import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/session";
import { findValidInvitation } from "@/lib/invitations";
import { AcceptForm } from "./accept-form";

export const metadata: Metadata = { title: "Invitación" };

export default function InvitationPage({ params }: PageProps<"/invitacion/[token]">) {
  return (
    <Suspense fallback={<Skeleton className="h-56" />}>
      {params.then(({ token }) => (
        <Invitation token={token} />
      ))}
    </Suspense>
  );
}

async function Invitation({ token }: { token: string }) {
  const invitation = await findValidInvitation(token);
  if (!invitation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Invitación no válida</CardTitle>
          <CardDescription>
            El enlace venció, fue anulado o ya se usó. Pida a quien lo invitó que le genere uno nuevo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/app" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 w-full" })}>
            Ir al inicio
          </Link>
        </CardContent>
      </Card>
    );
  }

  const user = await getCurrentUser();
  const next = encodeURIComponent(`/invitacion/${token}`);
  const asAccountant = invitation.kind === "accountant";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{invitation.companyName}</CardTitle>
        <CardDescription>
          {asAccountant
            ? "Lo invitan como contador. La empresa aparecerá en «Mis clientes» y podrá revisar sus facturas."
            : "Lo invitan a unirse al equipo para escanear y subir facturas."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {invitation.email && (
          <p className="text-sm text-muted-foreground">
            Esta invitación es para <span className="font-medium text-foreground">{invitation.email}</span>.
          </p>
        )}
        {user ? (
          <AcceptForm token={token} userEmail={user.email} />
        ) : (
          <>
            <Link href={`/registro?next=${next}`} className={buttonVariants({ size: "lg", className: "h-11" })}>
              Crear cuenta y aceptar
            </Link>
            <Link
              href={`/ingresar?next=${next}`}
              className={buttonVariants({ variant: "outline", size: "lg", className: "h-11" })}
            >
              Ya tengo cuenta
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
