"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { safeNext } from "@/lib/validation/auth";

/** Campo oculto con la ruta a la que volver después de ingresar (?next=). */
export function NextInput() {
  return (
    <Suspense>
      <NextInputInner />
    </Suspense>
  );
}

function NextInputInner() {
  const next = safeNext(useSearchParams().get("next"));
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

/** Link entre /ingresar y /registro que conserva ?next=. */
export function AuthSwitchLink({ href, children }: { href: string; children: React.ReactNode }) {
  const className = "font-medium text-foreground underline underline-offset-4";
  return (
    <Suspense
      fallback={
        <Link href={href} className={className}>
          {children}
        </Link>
      }
    >
      <AuthSwitchLinkInner href={href} className={className}>
        {children}
      </AuthSwitchLinkInner>
    </Suspense>
  );
}

function AuthSwitchLinkInner({
  href,
  className,
  children,
}: {
  href: string;
  className: string;
  children: React.ReactNode;
}) {
  const next = safeNext(useSearchParams().get("next"));
  return (
    <Link href={next ? `${href}?next=${encodeURIComponent(next)}` : href} className={className}>
      {children}
    </Link>
  );
}
