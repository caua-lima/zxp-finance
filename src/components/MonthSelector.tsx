"use client";

import { formatarMes, MES_MINIMO } from "@/lib/types";

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
  // Piso é MES_MINIMO (constante fixa: o mês em que o app começou), não o mês
  // corrente. Usar o mês corrente aqui fazia o piso andar junto com o
  // calendário, então a seta de voltar ficava sempre desabilitada e nenhum
  // mês passado era acessível — o histórico sumia conforme o tempo passava.
  const podeVoltar = mes > MES_MINIMO;

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
