import { AppHeader } from "@/components/app-header";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AccountantLayout({ children }: LayoutProps<"/contador">) {
  return (
    <TooltipProvider>
      <div className="flex flex-1 flex-col">
        <AppHeader wide />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      </div>
    </TooltipProvider>
  );
}
