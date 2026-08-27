/**
 * Fonte única das cores usadas pelo Recharts — o SVG do Recharts recebe string
 * crua em fill/stroke, então em vez de var(--chart-1) (inconsistente entre
 * navegadores dentro de <svg>) espelhamos aqui os mesmos hex de src/styles.css.
 * Se a paleta mudar, mudar nos dois lugares.
 */
export const CHART_COLORS = {
  ember: "#E8431C",
  frio: "#5C7B85",
  success: "#2F9E5B",
  morno: "#F0A93A",
  purple: "#7C3AED",
  grid: "#EAE6E1",
  axisText: "#756D63",
  tooltipBg: "#FFFFFF",
  tooltipBorder: "#EAE6E1",
  tooltipText: "#18140F",
} as const;

/** Paleta categórica fixa (chart-1..5) — ordem fixa, nunca cíclica. */
export const SERIES_COLORS = [
  CHART_COLORS.ember,
  CHART_COLORS.frio,
  CHART_COLORS.success,
  CHART_COLORS.morno,
  CHART_COLORS.purple,
] as const;
