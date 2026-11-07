import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = { title: "Invitación rechazada" };

export default function DeclinedPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invitación rechazada</CardTitle>
        <CardDescription>Listo. El enlace ya no se puede usar y quien lo invitó no tendrá acceso a su cuenta.</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href="/" className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 w-full" })}>
          Ir al inicio
        </Link>
      </CardContent>
    </Card>
  );
}
