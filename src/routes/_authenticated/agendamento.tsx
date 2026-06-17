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

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function fmtKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function AgendamentoPage() {
  const qc = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [openLead, setOpenLead] = useState<Lead | null>(null);
  const [creatingAt, setCreatingAt] = useState<string | null>(null);

  const settingsQ = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("*").maybeSingle();
      return data;
    },
  });

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        return d;
      }),
    [weekStart],
  );

  const rangeStart = fmtKey(days[0]);
  const rangeEndExclusive = useMemo(() => {
    const d = new Date(days[6]);
    d.setDate(d.getDate() + 1);
    return fmtKey(d);
  }, [days]);

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

  const totalWeek = leadsQ.data?.length ?? 0;
  const today = fmtKey(new Date());

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agendamento</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {totalWeek} agendamento(s) nesta semana
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setWeekStart((w) => {
                const d = new Date(w);
                d.setDate(d.getDate() - 7);
                return d;
              })
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setWeekStart(startOfWeek(new Date()))}>
            <CalendarDays className="h-4 w-4 mr-2" /> Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() =>
              setWeekStart((w) => {
                const d = new Date(w);
                d.setDate(d.getDate() + 7);
                return d;
              })
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="bg-card border border-border rounded-xl shadow-sm overflow-x-auto">
        <div className="min-w-[900px] grid grid-cols-[80px_repeat(7,1fr)]">
          <div className="border-b border-border p-2"></div>
          {days.map((d) => {
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
              {days.map((d) => {
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
