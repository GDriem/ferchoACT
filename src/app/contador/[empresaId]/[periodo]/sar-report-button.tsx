"use client";

import { FileSpreadsheetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/** Bloqueado hasta tener la plantilla oficial del SAR que entregue el contador. */
export function SarReportButton() {
  return (
    <Tooltip>
      {/* Un botón deshabilitado no recibe el puntero: el tooltip va en un envoltorio enfocable */}
      <TooltipTrigger
        render={<span tabIndex={0} className="rounded-lg focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none" />}
      >
        <Button size="lg" className="pointer-events-none h-11" disabled>
          <FileSpreadsheetIcon /> Generar reporte SAR
          <span className="sr-only"> (bloqueado hasta tener la plantilla oficial del contador)</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        El reporte sigue bloqueado hasta tener la plantilla oficial del contador.
      </TooltipContent>
    </Tooltip>
  );
}
