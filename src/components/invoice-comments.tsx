"use client";

import { CalculatorIcon, MessageSquareIcon, SendIcon } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { addComment, listComments, type CommentItem } from "@/app/actions/comments";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX = 2000;
const timeFmt = new Intl.DateTimeFormat("es-HN", {
  timeZone: "America/Tegucigalpa",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * Conversación sobre una factura entre quien la subió y el contador. Cada
 * comentario avisa por correo a los demás participantes.
 */
export function InvoiceComments({ invoiceId, initial }: { invoiceId: string; initial?: CommentItem[] }) {
  const [comments, setComments] = useState<CommentItem[] | null>(initial ?? null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const load = useCallback(async () => {
    setLoadError(null);
    const r = await listComments(invoiceId);
    if (r.ok) setComments(r.data);
    else setLoadError(r.error.message);
  }, [invoiceId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial cuando no vino del servidor
    if (!initial) void load();
  }, [initial, load]);

  function send() {
    setError(null);
    startSending(async () => {
      const r = await addComment({ invoiceId, body });
      if (!r.ok) return setError(r.error.message);
      setBody("");
      toast.success("Comentario enviado");
      await load();
    });
  }

  return (
    <section className="grid gap-3" aria-labelledby={`comments-${invoiceId}`}>
      <h2 id={`comments-${invoiceId}`} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <MessageSquareIcon className="size-4" aria-hidden /> Comentarios
      </h2>

      {loadError ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm">
          No pudimos cargar los comentarios.
          <Button variant="outline" size="lg" className="h-11" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      ) : comments === null ? (
        <div className="grid gap-2" aria-busy>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : comments.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aún no hay comentarios. Escriba aquí si tiene dudas sobre esta factura; se avisa por correo.
        </p>
      ) : (
        <ol className="grid gap-2">
          {comments.map((c) => (
            <li
              key={c.id}
              className={cn("grid gap-1 rounded-xl border p-3 text-sm", c.mine ? "bg-primary/5" : "bg-muted/40")}
            >
              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{c.mine ? "Usted" : c.authorName}</span>
                {c.fromAccountant && (
                  <span className="inline-flex items-center gap-1">
                    <CalculatorIcon className="size-3" aria-hidden /> Contador
                  </span>
                )}
                <time dateTime={c.createdAt}>{timeFmt.format(new Date(c.createdAt))}</time>
              </div>
              <p className="break-words whitespace-pre-wrap">{c.body}</p>
            </li>
          ))}
        </ol>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor={`comment-${invoiceId}`} className="sr-only">
          Nuevo comentario
        </Label>
        <Textarea
          id={`comment-${invoiceId}`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Escriba un comentario…"
          maxLength={MAX}
          disabled={sending}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `comment-${invoiceId}-error` : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) send();
          }}
        />
        {error && (
          <p id={`comment-${invoiceId}-error`} className="text-xs text-destructive">
            {error}
          </p>
        )}
        <Button
          type="button"
          size="lg"
          variant="outline"
          className="h-11 justify-self-end"
          disabled={sending || !body.trim()}
          onClick={send}
        >
          <SendIcon /> {sending ? "Enviando…" : "Comentar"}
        </Button>
      </div>
    </section>
  );
}
