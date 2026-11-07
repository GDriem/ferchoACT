import { CameraIcon } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/** Botón principal fijo abajo: "Escanear factura" (pantallas del cliente). */
export function ScanFab() {
  return (
    <>
      {/* Reserva el espacio para que el botón no tape el final de la lista */}
      <div className="h-20" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Link
          href="/app/facturas/nueva"
          className={buttonVariants({ size: "lg", className: "mx-auto flex h-12 w-full max-w-md text-base" })}
        >
          <CameraIcon /> Escanear factura
        </Link>
      </div>
    </>
  );
}
