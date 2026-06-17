import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  icon: LucideIcon;
  today: number | string;
  yesterday: number | string;
  week: number | string;
  month: number | string;
  footer?: React.ReactNode;
  accent?: boolean;
  size?: "default" | "lg";
  className?: string;
}

export function MetricCard({
  title,
  icon: Icon,
  today,
  yesterday,
  week,
  month,
  footer,
  accent,
  size = "default",
  className,
}: MetricCardProps) {
  const lg = size === "lg";
  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border shadow-sm transition-colors",
        lg ? "p-5" : "p-4",
        accent && "border-primary/40",
        className,
      )}
    >
      <div className={cn("flex items-center justify-between", lg ? "mb-4" : "mb-3")}>
        <h3 className={cn("font-medium text-muted-foreground", lg ? "text-base" : "text-sm")}>
          {title}
        </h3>
        <div
          className={cn(
            "rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0",
            lg ? "h-9 w-9" : "h-7 w-7",
          )}
        >
          <Icon className={lg ? "h-4 w-4" : "h-3.5 w-3.5"} strokeWidth={1.75} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {[
          { label: "Hoje", value: today },
          { label: "Ontem", value: yesterday },
          { label: "Semana", value: week },
          { label: "Mês", value: month },
        ].map((c) => (
          <div key={c.label} className="min-w-0">
            <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">
              {c.label}
            </p>
            <p className={cn("font-bold text-foreground truncate", lg ? "text-2xl" : "text-lg")}>
              {c.value}
            </p>
          </div>
        ))}
      </div>
      {footer && <div className="mt-2 pt-2 border-t border-border">{footer}</div>}
    </div>
  );
}
