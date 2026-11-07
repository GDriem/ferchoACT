import Link from "next/link";
import { Suspense } from "react";
import { logout } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/access";

export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/app" className="font-semibold tracking-tight">
            FerchoACT
          </Link>
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
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

async function UserName() {
  const user = await requireUser();
  return <span className="hidden text-muted-foreground sm:inline">{user.name}</span>;
}
