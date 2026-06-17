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
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl bg-card border border-border p-5 transition-colors",
        accent && "border-primary/40"
      )}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-muted-foreground">{title}</h3>
        <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Hoje", value: today },
          { label: "Ontem", value: yesterday },
          { label: "Semana", value: week },
          { label: "Mês", value: month },
        ].map((c) => (
          <div key={c.label} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
              {c.label}
            </p>
            <p className="text-xl font-bold text-foreground truncate">{c.value}</p>
          </div>
        ))}
      </div>
      {footer && <div className="mt-3 pt-3 border-t border-border">{footer}</div>}
    </div>
  );
}
