import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = React.ComponentProps<typeof Input> & {
  name: string;
  label: string;
  errors?: string[];
  hint?: string;
};

export function FormField({ name, label, errors, hint, ...inputProps }: Props) {
  const errorId = `${name}-error`;
  const hintId = `${name}-hint`;
  const hasError = !!errors?.length;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        className="h-11"
        aria-invalid={hasError || undefined}
        aria-describedby={[hasError && errorId, hint && hintId].filter(Boolean).join(" ") || undefined}
        {...inputProps}
      />
      {hint && !hasError && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {hasError && (
        <p id={errorId} className="text-xs text-destructive">
          {errors[0]}
        </p>
      )}
    </div>
  );
}
