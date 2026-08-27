import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Estado vazio como convite à ação, não como aviso — cada tela dizia só "Nada
 * cadastrado", sem indicar o que fazer a seguir. Usado dentro de <TableBody>
 * (colSpan) ou como bloco solto.
 */
export function EmptyState({
  icon: Icon,
  message,
  className,
}: {
  icon?: LucideIcon;
  message: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-8 text-center", className)}>
      {Icon && <Icon className="h-5 w-5 text-muted-foreground/50" strokeWidth={1.75} />}
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
