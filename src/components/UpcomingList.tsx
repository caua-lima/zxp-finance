"use client";

import Link from "next/link";
import { FinancialEntry, formatarMoeda } from "@/lib/types";
import { deriveDisplayStatus, labelOrigem } from "@/lib/finance/calculations";
import { StatusBadge, StatusBadgeValor } from "./StatusBadge";

const HREF_POR_ORIGEM: Record<FinancialEntry["source"], string> = {
  manual: "/saldo",
  income: "/ganhos",
  fixed_cost: "/contas",
  subscription: "/assinaturas",
  installment: "/parcelas",
  card_bill: "/fatura",
  adjustment: "/saldo",
  transfer: "/saldo",
};

function dataCurta(iso: string): string {
  const [, mes, dia] = iso.split("-");
  return `${dia}/${mes}`;
}

export function UpcomingList({
  itens,
  hojeISO,
}: {
  itens: FinancialEntry[];
  hojeISO: string;
}) {
  if (itens.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 text-center">
        <p className="text-sm text-text-faint">Nenhum vencimento pendente nos próximos 30 dias.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {itens.map((e) => (
        <li
          key={e.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs text-text-faint">{dataCurta(e.dueDate)}</span>
              <span className="text-xs text-text-faint">·</span>
              <span className="text-xs text-text-faint">{labelOrigem(e.source)}</span>
            </div>
            <p className="text-sm text-text truncate">{e.description}</p>
            <div className="mt-1">
              <StatusBadge status={deriveDisplayStatus(e, hojeISO) as StatusBadgeValor} />
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1.5">
            <span className="text-sm font-semibold text-gold">{formatarMoeda(e.amount)}</span>
            <Link
              href={HREF_POR_ORIGEM[e.source]}
              aria-label={`Ver ${e.description}`}
              className="-mr-2 inline-flex min-h-[44px] items-center px-2 text-xs font-medium text-brand hover:text-brand-dark"
            >
              Ver
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
