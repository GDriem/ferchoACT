CREATE TYPE "public"."invoice_kind" AS ENUM('purchase', 'sale');--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_categories_companyId_name_unique" UNIQUE NULLS NOT DISTINCT("company_id","name")
);
--> statement-breakpoint
CREATE TABLE "invoice_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "accountant_code" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "avatar_blob" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "logo_blob" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "kind" "invoice_kind" DEFAULT 'purchase' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "nombre_comprador" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "company_invitations" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_comments" ADD CONSTRAINT "invoice_comments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_comments" ADD CONSTRAINT "invoice_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_comments_invoice_id_created_at_index" ON "invoice_comments" USING btree ("invoice_id","created_at");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_accountantCode_unique" UNIQUE("accountant_code");--> statement-breakpoint
INSERT INTO "expense_categories" ("name") VALUES
  ('Mercadería para la venta'),
  ('Materiales y suministros'),
  ('Combustible'),
  ('Alimentación'),
  ('Servicios públicos (energía, agua, teléfono, internet)'),
  ('Alquiler'),
  ('Papelería y útiles de oficina'),
  ('Mantenimiento y reparaciones'),
  ('Transporte y fletes'),
  ('Honorarios profesionales'),
  ('Publicidad'),
  ('Mobiliario y equipo'),
  ('Otros gastos');
