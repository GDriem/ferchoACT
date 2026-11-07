"use client";

import { CameraIcon, FileTextIcon, FileUpIcon, RotateCcwIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { confirmUpload, requestUpload } from "@/app/actions/invoices";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { compressImage, uploadToBlob } from "@/lib/image";

type Company = { id: string; legalName: string };
type Picked = { blob: Blob; contentType: string; previewUrl: string | null; name: string };

const LAST_COMPANY_KEY = "ferchoact:last-company";
const MAX_BYTES = 10 * 1024 * 1024;

export function Scanner({ companies }: { companies: Company[] }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [companyId, setCompanyId] = useState(companies[0].id);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [busy, setBusy] = useState<"preparing" | "uploading" | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Recordar la última empresa usada (solo comodidad; si falla no pasa nada)
  useEffect(() => {
    try {
      const last = localStorage.getItem(LAST_COMPANY_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura única de localStorage al montar
      if (last && companies.some((c) => c.id === last)) setCompanyId(last);
    } catch {}
  }, [companies]);

  useEffect(() => () => void (picked?.previewUrl && URL.revokeObjectURL(picked.previewUrl)), [picked]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy("preparing");
    try {
      if (file.type === "application/pdf") {
        if (file.size > MAX_BYTES) throw new Error("too-big");
        setPicked({ blob: file, contentType: file.type, previewUrl: null, name: file.name });
      } else {
        const blob = await compressImage(file);
        const contentType = blob.type || "image/jpeg";
        setPicked({ blob, contentType, previewUrl: URL.createObjectURL(blob), name: file.name });
      }
    } catch (e) {
      setError(
        (e as Error).message === "too-big"
          ? "El PDF pesa más de 10 MB."
          : "No pudimos leer esa imagen. Tome la foto de nuevo o suba un PDF.",
      );
    } finally {
      setBusy(null);
      if (cameraRef.current) cameraRef.current.value = "";
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function upload() {
    if (!picked) return;
    setError(null);
    setBusy("uploading");
    setProgress(0);
    try {
      localStorage.setItem(LAST_COMPANY_KEY, companyId);
    } catch {}

    const req = await requestUpload({ companyId, contentType: picked.contentType, sizeBytes: picked.blob.size });
    if (!req.ok) {
      setBusy(null);
      return setError(req.error.message);
    }
    try {
      await uploadToBlob(req.data.uploadUrl, picked.blob, picked.contentType, setProgress);
    } catch {
      setBusy(null);
      return setError("Se perdió la conexión al subir. Revise su internet y toque «Usar foto» otra vez.");
    }
    const done = await confirmUpload({ companyId, blobName: req.data.blobName });
    if (!done.ok) {
      setBusy(null);
      return setError(done.error.message);
    }
    router.push(`/app/facturas/${done.data.invoiceId}`);
  }

  return (
    <div className="grid gap-4">
      {companies.length > 1 && (
        <div className="grid gap-1.5">
          <Label htmlFor="company">Empresa</Label>
          <Select
            value={companyId}
            onValueChange={(v) => v && setCompanyId(v)}
            items={companies.map((c) => ({ value: c.id, label: c.legalName }))}
          >
            <SelectTrigger id="company" className="h-11 w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.legalName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <input
        ref={cameraRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {!picked ? (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={busy !== null}
            className="grid min-h-56 place-items-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition-colors hover:bg-muted/50 disabled:opacity-60"
          >
            <CameraIcon className="size-10 text-muted-foreground" aria-hidden />
            <span className="text-base font-medium">{busy === "preparing" ? "Preparando foto…" : "Tomar foto"}</span>
            <span className="text-sm text-muted-foreground">
              Ponga la factura sobre una superficie plana, con buena luz y completa en la foto.
            </span>
          </button>
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
          >
            <FileUpIcon /> Subir PDF o imagen
          </Button>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-xl border bg-muted/30">
            {picked.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              <img src={picked.previewUrl} alt="Vista previa de la factura" className="max-h-[60vh] w-full object-contain" />
            ) : (
              <div className="flex items-center gap-3 p-6">
                <FileTextIcon className="size-8 text-muted-foreground" aria-hidden />
                <span className="truncate text-sm font-medium">{picked.name}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground tabular-nums">
            {(picked.blob.size / 1024).toFixed(0)} KB · {picked.contentType === "application/pdf" ? "PDF" : "JPEG"}
          </p>

          {busy === "uploading" ? (
            <div className="grid gap-1.5" role="status" aria-live="polite">
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p className="text-sm text-muted-foreground tabular-nums">
                {progress < 1 ? `Subiendo… ${Math.round(progress * 100)} %` : "Guardando…"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12"
                onClick={() => {
                  setPicked(null);
                  setError(null);
                }}
              >
                <RotateCcwIcon /> Repetir
              </Button>
              <Button type="button" size="lg" className="h-12" onClick={upload}>
                Usar {picked.previewUrl ? "foto" : "PDF"}
              </Button>
            </div>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
