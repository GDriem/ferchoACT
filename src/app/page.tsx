import { CameraIcon, FileSpreadsheetIcon, UsersIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

const features = [
  {
    icon: CameraIcon,
    title: "Escanee con el celular",
    body: "Tome una foto de la factura y los datos se llenan solos. Usted solo confirma.",
  },
  {
    icon: UsersIcon,
    title: "Todo su equipo",
    body: "Cada persona de la empresa sube sus facturas; quedan ordenadas por mes.",
  },
  {
    icon: FileSpreadsheetIcon,
    title: "Listo para el SAR",
    body: "Su contador revisa las facturas y genera el reporte mensual en minutos.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-4 py-12">
      <div className="grid gap-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Sus facturas, directo a su contador.
        </h1>
        <p className="text-lg text-muted-foreground">
          Escanee sus facturas de compra desde el celular y deje que su contador prepare la
          declaración del SAR sin perseguir papeles.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link href="/registro" className={buttonVariants({ size: "lg", className: "h-11 px-5" })}>
            Crear cuenta
          </Link>
          <Link
            href="/ingresar"
            className={buttonVariants({ variant: "outline", size: "lg", className: "h-11 px-5" })}
          >
            Ingresar
          </Link>
        </div>
      </div>
      <ul className="grid gap-6 sm:grid-cols-3">
        {features.map(({ icon: Icon, title, body }) => (
          <li key={title} className="grid gap-2">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
            <h2 className="font-medium">{title}</h2>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
