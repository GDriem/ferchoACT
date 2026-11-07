import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/access";
import { cn } from "@/lib/utils";

export function AppHeader({ wide }: { wide?: boolean }) {
  return (
    <header className="border-b">
      <div className={cn("mx-auto flex h-14 w-full items-center justify-between gap-4 px-4", wide ? "max-w-7xl" : "max-w-5xl")}>
        <div className="flex items-center gap-4">
          <Link href="/app" className="font-semibold tracking-tight">
            FerchoACT
          </Link>
          <Suspense>
            <AccountantLink />
          </Suspense>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Suspense>
            <UserName />
          </Suspense>
          <form action={logout}>
            <Button type="submit" variant="ghost" size="lg" className="h-11">
              Salir
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}

async function UserName() {
  const user = await requireUser();
  return <span className="hidden text-muted-foreground sm:inline">{user.name}</span>;
}

async function AccountantLink() {
  const user = await requireUser();
  if (!user.isAccountant) return null;
  return (
    <Link href="/contador" className="text-sm text-muted-foreground hover:text-foreground">
      Revisión de facturas
    </Link>
  );
}
