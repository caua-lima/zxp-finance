"use client";

import { useMemo, useState } from "react";
import { FinancialEntry, formatarMoeda } from "@/lib/types";
import { PontoFluxoDiario } from "@/lib/finance/calculations";

type Range = "7" | "mes";

function diaCurto(iso: string): string {
  const [, , dia] = iso.split("-");
  return dia;
}

export function CashFlowChart({
  pontos,
  entries,
}: {
  pontos: PontoFluxoDiario[];
  entries: FinancialEntry[];
}) {
  const [range, setRange] = useState<Range>("mes");
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);

  const visiveis = useMemo(() => {
    if (range === "7") return pontos.slice(-7);
    return pontos;
  }, [pontos, range]);

  if (pontos.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-5 text-center">
        <p className="text-sm text-text-faint">
          Defina o saldo atual pra ver o fluxo de caixa do mês.
        </p>
      </div>
    );
  }

  const maiorMovimento = Math.max(
    1,
    ...visiveis.map((p) => Math.max(p.entradas, p.saidas))
  );
  const saldos = visiveis.map((p) => p.saldoAcumulado);
  const minSaldo = Math.min(0, ...saldos);
  const maxSaldo = Math.max(1, ...saldos);

  const largura = 100;
  const altura = 40;
  const passo = largura / Math.max(1, visiveis.length - 1 || 1);

  const linha = visiveis
    .map((p, i) => {
      const x = visiveis.length === 1 ? 0 : i * passo;
      const y =
        altura - ((p.saldoAcumulado - minSaldo) / (maxSaldo - minSaldo || 1)) * altura;
      return `${x},${y}`;
    })
    .join(" ");

  const itensDoDia = diaSelecionado
    ? entries.filter(
        (e) => e.dueDate.slice(0, 10) === diaSelecionado || e.paidAt?.slice(0, 10) === diaSelecionado
      )
    : [];

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium text-text-muted">Fluxo de caixa</h2>
        <div className="flex gap-1 rounded-lg border border-line p-0.5">
          {(["7", "mes"] as Range[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                range === r ? "bg-brand text-on-brand" : "text-text-muted hover:text-text"
              }`}
            >
              {r === "7" ? "7 dias" : "Mês"}
            </button>
          ))}
        </div>
      </div>

      {/* linha de saldo acumulado */}
      <svg viewBox={`0 0 ${largura} ${altura}`} className="w-full h-24" preserveAspectRatio="none">
        <line x1={0} x2={largura} y1={altura - ((0 - minSaldo) / (maxSaldo - minSaldo || 1)) * altura} y2={altura - ((0 - minSaldo) / (maxSaldo - minSaldo || 1)) * altura} stroke="var(--color-line)" strokeWidth={0.3} strokeDasharray="1,1" />
        <polyline
          points={linha}
          fill="none"
          stroke="var(--color-brand)"
          strokeWidth={0.8}
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* barras entradas/saídas por dia, clicáveis */}
      <div className="flex items-end gap-[2px] h-16 mt-2">
        {visiveis.map((p) => {
          const alturaEntrada = (p.entradas / maiorMovimento) * 100;
          const alturaSaida = (p.saidas / maiorMovimento) * 100;
          const selecionado = diaSelecionado === p.data;
          return (
            <button
              key={p.data}
              onClick={() => setDiaSelecionado(selecionado ? null : p.data)}
              title={`${p.data} · entradas ${formatarMoeda(p.entradas)} · saídas ${formatarMoeda(p.saidas)} · saldo ${formatarMoeda(p.saldoAcumulado)}`}
              className={`flex-1 flex flex-col justify-end gap-[1px] h-full rounded-sm transition-opacity ${
                selecionado ? "ring-1 ring-brand" : "hover:opacity-80"
              }`}
            >
              <div
                className="w-full bg-positive/70 rounded-t-sm"
                style={{ height: `${alturaEntrada}%` }}
              />
              <div
                className="w-full bg-negative/70 rounded-b-sm"
                style={{ height: `${alturaSaida}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className="flex justify-between mt-1 text-[9px] text-text-faint">
        <span>{diaCurto(visiveis[0].data)}</span>
        <span>{diaCurto(visiveis[visiveis.length - 1].data)}</span>
      </div>

      <div className="flex items-center gap-4 mt-3 text-xs text-text-faint">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-positive/70" /> Entradas
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-negative/70" /> Saídas
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-brand" /> Saldo acumulado
        </span>
      </div>

      {diaSelecionado && (
        <div className="mt-3 rounded-xl border border-line bg-surface-2 p-3">
          <p className="text-xs text-text-muted mb-2">
            Lançamentos em {diaSelecionado.split("-").reverse().join("/")}
          </p>
          {itensDoDia.length === 0 ? (
            <p className="text-xs text-text-faint">Nada nesse dia.</p>
          ) : (
            <ul className="space-y-1">
              {itensDoDia.map((e) => (
                <li key={e.id} className="flex justify-between text-xs">
                  <span className="text-text truncate">{e.description}</span>
                  <span className={e.type === "income" ? "text-positive" : "text-gold"}>
                    {e.type === "income" ? "+" : "-"} {formatarMoeda(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
