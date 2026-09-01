import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Container único de página — antes cada rota travava numa largura diferente
 * (max-w-5xl, max-w-[1600px] ou nenhuma), sobrando margem morta enorme em
 * telas largas. `bleed` é só pras telas de canvas cheio (CRM/Chat/Agenda),
 * que já controlam a própria altura/scroll.
 */
export function PageContainer({
  children,
  className,
  bleed,
}: {
  children: ReactNode;
  className?: string;
  bleed?: boolean;
}) {
  return (
    <div className={cn("p-4 lg:p-6", !bleed && "max-w-[1920px] mx-auto", className)}>
      {children}
    </div>
  );
}
