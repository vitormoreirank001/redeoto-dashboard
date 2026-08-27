import type { LucideIcon } from "lucide-react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatBreakdownItem {
  label: string;
  value: string | number;
}

interface StatProps {
  title: string;
  icon: LucideIcon;
  size?: "default" | "lg";
  className?: string;
  accent?: boolean;
  /** Barra de acento à esquerda — o único elemento "ousado" do sistema: sinaliza
   * se o lead por trás do número está sem resposta há pouco tempo (urgente)
   * ou esfriando (sem resposta há mais de 24h, prioridade visual mais baixa). */
  temperature?: "urgent" | "cooling";
  footer?: React.ReactNode;
  /** Modo A — valor único + variação (Financeiro: Receita/Custo/Lucro/Margem). */
  value?: string | number;
  change?: number | null;
  changeIsPoints?: boolean;
  goodWhenUp?: boolean;
  /** Modo B — painel Hoje/Ontem/Semana/Mês (Dashboard). */
  breakdown?: StatBreakdownItem[];
}

const TEMPERATURE_BAR: Record<NonNullable<StatProps["temperature"]>, string> = {
  urgent: "bg-primary",
  cooling: "bg-frio",
};

export function Stat({
  title,
  icon: Icon,
  size = "default",
  className,
  accent,
  temperature,
  footer,
  value,
  change,
  changeIsPoints,
  goodWhenUp,
  breakdown,
}: StatProps) {
  const lg = size === "lg";
  const isUp = (change ?? 0) >= 0;
  const isGood = change == null ? null : isUp === !!goodWhenUp;

  return (
    <div
      className={cn(
        "relative rounded-xl bg-card border border-border shadow-sm transition-colors overflow-hidden",
        lg ? "p-6" : "p-5",
        accent && "border-primary/40",
        className,
      )}
    >
      {temperature && (
        <span className={cn("absolute inset-y-0 left-0 w-1", TEMPERATURE_BAR[temperature])} />
      )}
      <div className={cn("flex items-center justify-between", lg ? "mb-5" : "mb-4")}>
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

      {breakdown ? (
        <div className="grid grid-cols-4 gap-3">
          {breakdown.map((c) => (
            <div key={c.label} className="min-w-0">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">
                {c.label}
              </p>
              <p
                className={cn(
                  "font-mono-data font-bold text-foreground truncate",
                  lg ? "text-2xl" : "text-lg",
                )}
              >
                {c.value}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <>
          <p className={cn("font-mono-data font-bold text-foreground", lg ? "text-3xl" : "text-2xl")}>
            {value}
          </p>
          {change !== null && change !== undefined && (
            <p
              className={cn(
                "text-xs mt-1.5 flex items-center gap-1",
                isGood ? "text-success" : "text-destructive",
              )}
            >
              {isUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {isUp ? "+" : ""}
              {change.toFixed(1)}
              {changeIsPoints ? "pp" : "%"} vs mês anterior
            </p>
          )}
        </>
      )}

      {footer && <div className="mt-3 pt-3 border-t border-border">{footer}</div>}
    </div>
  );
}
