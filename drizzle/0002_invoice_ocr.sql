ALTER TABLE "invoices" ADD COLUMN "ocr_fields" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "ocr_error" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoice_files" ADD CONSTRAINT "invoice_files_blobName_unique" UNIQUE("blob_name");