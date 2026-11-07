import { cn } from "@/lib/utils";

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

/** Foto de perfil o logo; si no hay imagen, las iniciales. */
export function UserAvatar({
  name,
  url,
  className,
  square,
}: {
  name: string;
  url: string | null;
  className?: string;
  /** Logos de empresa: esquinas suaves en lugar de círculo. */
  square?: boolean;
}) {
  const shape = square ? "rounded-lg" : "rounded-full";
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- SAS de lectura temporal
      <img src={url} alt="" className={cn("size-8 shrink-0 bg-muted object-cover", shape, className)} />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-8 shrink-0 place-items-center bg-muted text-xs font-semibold text-muted-foreground",
        shape,
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
