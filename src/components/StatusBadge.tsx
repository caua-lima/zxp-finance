export type StatusBadgeValor =
  | "paid"
  | "received"
  | "pending"
  | "planned"
  | "overdue"
  | "cancelled"
  | "archived";

const CONFIG: Record<StatusBadgeValor, { label: string; simbolo: string; cor: string; bg: string }> = {
  paid: { label: "Pago", simbolo: "✓", cor: "text-positive", bg: "bg-positive-soft" },
  received: { label: "Recebido", simbolo: "✓", cor: "text-positive", bg: "bg-positive-soft" },
  pending: { label: "Pendente", simbolo: "○", cor: "text-gold", bg: "bg-gold-soft" },
  planned: { label: "Previsto", simbolo: "◌", cor: "text-info", bg: "bg-info/10" },
  overdue: { label: "Atrasado", simbolo: "!", cor: "text-negative", bg: "bg-negative-soft" },
  cancelled: { label: "Cancelado", simbolo: "✕", cor: "text-text-faint", bg: "bg-surface-2" },
  archived: { label: "Arquivado", simbolo: "▢", cor: "text-text-faint", bg: "bg-surface-2" },
};

/**
 * Nunca comunica status só por cor — sempre símbolo + texto junto,
 * pra quem tem daltonismo ou usa contraste alto conseguir ler igual.
 */
export function StatusBadge({ status }: { status: StatusBadgeValor }) {
  const c = CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${c.cor} ${c.bg}`}
    >
      <span aria-hidden="true">{c.simbolo}</span>
      {c.label}
    </span>
  );
}
