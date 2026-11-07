import type { Metadata } from "next";
import { CompanyForm } from "./company-form";

export const metadata: Metadata = { title: "Registrar empresa" };

export default function NewCompanyPage() {
  return (
    <div className="mx-auto w-full max-w-md">
      <CompanyForm />
    </div>
  );
}
