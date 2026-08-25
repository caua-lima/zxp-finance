"use client";

import { formatarMes, mesPadrao } from "@/lib/types";

function somarMes(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const data = new Date(ano, m - 1 + delta, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export function MonthSelector({
  mes,
  onChange,
}: {
  mes: string;
  onChange: (mes: string) => void;
}) {
  const minimo = mesPadrao();
  const podeVoltar = mes > minimo;

  return (
    <div className="mb-4 flex items-center justify-between gap-2 rounded-xl border border-line bg-surface p-1">
      <button
        onClick={() => podeVoltar && onChange(somarMes(mes, -1))}
        disabled={!podeVoltar}
        aria-label="Mês anterior"
        className="flex h-10 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-text-muted transition-colors enabled:active:bg-surface-2 enabled:hover:text-text disabled:opacity-25 disabled:cursor-not-allowed"
      >
        ←
      </button>
      <span className="truncate text-sm font-semibold capitalize">
        {formatarMes(mes)}
      </span>
      <button
        onClick={() => onChange(somarMes(mes, 1))}
        aria-label="Próximo mês"
        className="flex h-10 w-11 shrink-0 items-center justify-center rounded-lg text-lg text-text-muted transition-colors hover:text-text active:bg-surface-2"
      >
        →
      </button>
    </div>
  );
}
