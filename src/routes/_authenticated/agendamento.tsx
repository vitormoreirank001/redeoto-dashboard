import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Fragment, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { LeadModal } from "@/components/lead-modal";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Lead } from "@/routes/_authenticated/crm";

export const Route = createFileRoute("/_authenticated/agendamento")({
  component: AgendamentoPage,
});

type View = "day" | "week" | "month";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function startOfDay(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function startOfWeek(d: Date) {
  const r = startOfDay(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function AgendamentoPage() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>("week");
  const [anchor, setAnchor] = useState(() => new Date());
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [creatingAt, setCreatingAt] = useState<string | null>(null);

  const settingsQ = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").maybeSingle();
      return data;
    },
  });

  const visibleDays = useMemo(() => {
    if (view === "day") return [startOfDay(anchor)];
    if (view === "week") {
      const start = startOfWeek(anchor);
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const gridStart = startOfWeek(startOfMonth(anchor));
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [view, anchor]);

  const rangeStart = fmtKey(visibleDays[0]);
  const rangeEndExclusive = fmtKey(addDays(visibleDays[visibleDays.length - 1], 1));

  const leadsQ = useQuery({
    queryKey: ["leads_agenda", rangeStart, rangeEndExclusive],
    queryFn: async () => {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .gte("appointment_date", rangeStart)
        .lt("appointment_date", rangeEndExclusive)
        .order("appointment_date");
      return (data ?? []) as unknown as Lead[];
    },
  });

  const startHour = settingsQ.data?.agenda_start_hour ?? 8;
  const endHour = settingsQ.data?.agenda_end_hour ?? 18;
  const slotMinutes = settingsQ.data?.agenda_slot_minutes ?? 30;

  const slots = useMemo(() => {
    const out: { hour: number; minute: number }[] = [];
    for (let m = startHour * 60; m < endHour * 60; m += slotMinutes) {
      out.push({ hour: Math.floor(m / 60), minute: m % 60 });
    }
    return out;
  }, [startHour, endHour, slotMinutes]);

  const leadsByDay = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    (leadsQ.data ?? []).forEach((l) => {
      if (!l.appointment_date) return;
      const day = l.appointment_date.slice(0, 10);
      (map[day] ??= []).push(l);
    });
    return map;
  }, [leadsQ.data]);

  function leadAt(dayKey: string, hour: number, minute: number): Lead | undefined {
    return leadsByDay[dayKey]?.find((l) => {
      const dt = new Date(l.appointment_date!);
      return dt.getHours() === hour && dt.getMinutes() === minute;
    });
  }

  function slotDateTime(day: Date, hour: number, minute: number) {
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  }

  function shift(delta: number) {
    setAnchor((a) => {
      if (view === "day") return addDays(a, delta);
      if (view === "week") return addDays(a, delta * 7);
      const r = new Date(a);
      r.setMonth(r.getMonth() + delta);
      return r;
    });
  }

  const today = fmtKey(new Date());

  const totalCount = useMemo(() => {
    if (view !== "month") return leadsQ.data?.length ?? 0;
    return (leadsQ.data ?? []).filter((l) => {
      if (!l.appointment_date) return false;
      const d = new Date(l.appointment_date);
      return d.getMonth() === anchor.getMonth() && d.getFullYear() === anchor.getFullYear();
    }).length;
  }, [leadsQ.data, view, anchor]);

  const countLabel =
    view === "day"
      ? `${totalCount} agendamento(s) neste dia`
      : view === "week"
        ? `${totalCount} agendamento(s) nesta semana`
        : `${totalCount} agendamento(s) neste mês`;

  const periodLabel =
    view === "day"
      ? anchor.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
      : view === "week"
        ? `${visibleDays[0].getDate()}/${visibleDays[0].getMonth() + 1} – ${visibleDays[6].getDate()}/${visibleDays[6].getMonth() + 1}`
        : `${MONTHS[anchor.getMonth()]} de ${anchor.getFullYear()}`;

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agendamento</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {periodLabel} · {countLabel}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center rounded-md border border-border overflow-hidden">
            {(
              [
                { id: "day", label: "Dia" },
                { id: "week", label: "Semana" },
                { id: "month", label: "Mês" },
              ] as const
            ).map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={cn(
                  "text-xs px-3 h-9 font-medium transition-colors",
                  view === v.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => shift(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setAnchor(new Date())}>
            <CalendarDays className="h-4 w-4 mr-2" /> Hoje
          </Button>
          <Button variant="outline" size="icon" onClick={() => shift(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {view === "month" ? (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="border-b border-border p-2 text-center text-xs text-muted-foreground font-medium"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {visibleDays.map((d) => {
              const key = fmtKey(d);
              const isToday = key === today;
              const inMonth = d.getMonth() === anchor.getMonth();
              const dayLeads = leadsByDay[key] ?? [];
              return (
                <button
                  key={key}
                  onClick={() => {
                    setAnchor(d);
                    setView("day");
                  }}
                  className={cn(
                    "border-b border-l border-border p-1.5 min-h-[88px] text-left align-top transition-colors hover:bg-muted/40",
                    !inMonth && "bg-muted/20",
                  )}
                >
                  <div
                    className={cn(
                      "text-xs font-semibold",
                      isToday
                        ? "h-5 w-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-foreground/50",
                    )}
                  >
                    {d.getDate()}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {dayLeads.slice(0, 3).map((l) => (
                      <div
                        key={l.id}
                        className="text-[10px] truncate px-1 py-0.5 rounded bg-primary/10 text-primary"
                      >
                        {l.name}
                      </div>
                    ))}
                    {dayLeads.length > 3 && (
                      <div className="text-[10px] text-muted-foreground px-1">
                        +{dayLeads.length - 3} mais
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-x-auto">
          <div
            className={cn("grid", view === "week" && "min-w-[900px]")}
            style={{ gridTemplateColumns: `80px repeat(${visibleDays.length}, 1fr)` }}
          >
            <div className="border-b border-border p-2"></div>
            {visibleDays.map((d) => {
              const key = fmtKey(d);
              const isToday = key === today;
              return (
                <div
                  key={key}
                  className={cn(
                    "border-b border-l border-border p-2 text-center",
                    isToday && "bg-primary/5",
                  )}
                >
                  <div className="text-xs text-muted-foreground">{WEEKDAYS[d.getDay()]}</div>
                  <div className={cn("text-sm font-semibold", isToday && "text-primary")}>
                    {d.getDate()}/{d.getMonth() + 1}
                  </div>
                </div>
              );
            })}

            {slots.map(({ hour, minute }) => (
              <Fragment key={`row-${hour}-${minute}`}>
                <div
                  key={`label-${hour}-${minute}`}
                  className="border-b border-border p-2 text-xs text-muted-foreground text-right pr-3"
                >
                  {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
                </div>
                {visibleDays.map((d) => {
                  const dayKey = fmtKey(d);
                  const lead = leadAt(dayKey, hour, minute);
                  return (
                    <button
                      key={`${dayKey}-${hour}-${minute}`}
                      onClick={() => {
                        if (lead) setOpenLead(lead);
                        else setCreatingAt(slotDateTime(d, hour, minute));
                      }}
                      className={cn(
                        "border-b border-l border-border p-1.5 text-left min-h-[44px] text-xs transition-colors",
                        lead
                          ? "bg-primary/10 hover:bg-primary/15"
                          : "hover:bg-muted/60 text-muted-foreground/50",
                      )}
                    >
                      {lead ? (
                        <div className="font-medium text-primary truncate">{lead.name}</div>
                      ) : (
                        <span className="opacity-0 group-hover:opacity-100">Disponível</span>
                      )}
                    </button>
                  );
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}

      {(openLead || creatingAt) && (
        <LeadModal
          lead={openLead}
          initial={creatingAt ? { appointment_date: creatingAt, stage: "agendado" } : undefined}
          onClose={() => {
            setOpenLead(null);
            setCreatingAt(null);
          }}
          onSaved={() => {
            toast.success("Agendamento salvo");
            qc.invalidateQueries({ queryKey: ["leads_agenda"] });
            qc.invalidateQueries({ queryKey: ["leads"] });
          }}
        />
      )}
    </div>
  );
}
