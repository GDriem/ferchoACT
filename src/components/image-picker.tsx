"use client";

import { ImageUpIcon, Trash2Icon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import type { ActionResult } from "@/lib/action-result";
import { compressImage } from "@/lib/image";

/**
 * Cambiar foto de perfil o logo. La imagen se reduce en el navegador
 * (512 px) antes de subirla, así nunca pasa de 1 MB.
 */
export function ImagePicker({
  name,
  url,
  square,
  label,
  savedMessage,
  upload,
  remove,
  extra,
}: {
  name: string;
  url: string | null;
  square?: boolean;
  label: string;
  /** Texto del aviso al guardar, p. ej. "Foto actualizada". */
  savedMessage: string;
  upload: (formData: FormData) => Promise<ActionResult>;
  remove: () => Promise<ActionResult>;
  /** Campos ocultos que acompañan la subida (p. ej. companyId). */
  extra?: Record<string, string>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    startTransition(async () => {
      let blob: Blob;
      try {
        blob = await compressImage(file, { maxSide: 512, quality: 0.85 });
      } catch {
        return setError("No pudimos leer esa imagen. Pruebe con otra (JPG o PNG).");
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
      const fd = new FormData();
      for (const [k, v] of Object.entries(extra ?? {})) fd.set(k, v);
      fd.set("file", new File([blob], "imagen.jpg", { type: blob.type || "image/jpeg" }));
      const r = await upload(fd);
      if (!r.ok) return setError(r.error.message);
      toast.success(savedMessage);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <UserAvatar name={name} url={url} square={square} className="size-20 text-xl" />
      <div className="grid gap-2">
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => onFile(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="lg" className="h-11" disabled={pending} onClick={() => inputRef.current?.click()}>
            <ImageUpIcon /> {pending ? "Subiendo…" : url ? `Cambiar ${label.toLowerCase()}` : `Subir ${label.toLowerCase()}`}
          </Button>
          {url && (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const r = await remove();
                  if (!r.ok) setError(r.error.message);
                })
              }
            >
              <Trash2Icon /> Quitar
            </Button>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
