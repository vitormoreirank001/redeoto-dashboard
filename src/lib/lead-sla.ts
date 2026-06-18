export interface SlaLead {
  stage: string;
  updated_at: string;
  entry_date: string;
  checklist: Record<string, boolean> | null;
}

const SLA_MS: Record<string, number> = {
  novo: 30 * 60 * 1000,
  contato: 24 * 60 * 60 * 1000,
};

export const FOLLOWUP_STEPS = [
  { key: "followup_24h", days: 1, label: "24h" },
  { key: "followup_3d", days: 3, label: "3 dias" },
  { key: "followup_7d", days: 7, label: "7 dias" },
  { key: "followup_14d", days: 14, label: "14 dias" },
] as const;

export function overdueFollowupStep(lead: SlaLead) {
  if (lead.stage !== "followup") return null;
  const entry = new Date(lead.entry_date).getTime();
  const next = FOLLOWUP_STEPS.find((s) => !lead.checklist?.[s.key]);
  if (!next) return null;
  return Date.now() - entry > next.days * 24 * 60 * 60 * 1000 ? next : null;
}

export function isOverdue(lead: SlaLead) {
  const sla = SLA_MS[lead.stage];
  if (sla && Date.now() - new Date(lead.updated_at).getTime() > sla) return true;
  return !!overdueFollowupStep(lead);
}
