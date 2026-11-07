"use client";

import { LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const INTERVAL_MS = 2500;
const MAX_TRIES = 48; // ~2 minutos

/** Mientras el OCR corre, vuelve a pedir la página cada pocos segundos. */
export function ProcessingRefresher() {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const id = setInterval(() => {
      if (++tries > MAX_TRIES) return clearInterval(id);
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [router]);
  return <LoaderCircleIcon className="size-5 shrink-0 animate-spin text-muted-foreground" aria-hidden />;
}
