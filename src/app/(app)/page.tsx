"use client";

import { useState } from "react";
import Link from "next/link";
import { formatarMoeda, formatarMes, mesPadrao } from "@/lib/types";
import { useFinanceDashboard } from "@/lib/finance/useFinanceDashboard";
import { hojeISO } from "@/lib/finance/calculations";
import { MonthSelector } from "@/components/MonthSelector";
import { ErroBanner } from "@/components/ErroBanner";
import { FinanceActionCenter } from "@/components/FinanceActionCenter";
import { CashFlowChart } from "@/components/CashFlowChart";
import { UpcomingList } from "@/components/UpcomingList";
import { CategoryDonut } from "@/components/CategoryDonut";
import { SkeletonHome } from "@/components/Skeleton";

function formatarQuando(timestamp: number | null): string {
  if (!timestamp) return "nunca conferido";
  return new Date(timestamp).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function DashboardPage() {
  const [mes, setMes] = useState(mesPadrao());
  const dash = useFinanceDashboard(mes);

  return (
    <div className="space-y-5">
      {/* A. Cabeçalho */}
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <div>
            <h1 className="text-lg font-semibold">Resumo financeiro</h1>
            <p className="text-xs text-text-faint mt-0.5">
              {formatarMes(mes)} · saldo conferido em {formatarQuando(dash.ultimaAtualizacaoSaldo)}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/ganhos"
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-text-muted hover:border-brand/40 hover:text-text transition-colors"
            >
              + Receita
            </Link>
            <Link
              href="/saldo"
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-text-muted hover:border-brand/40 hover:text-text transition-colors"
            >
              + Despesa
            </Link>
            <Link
              href="/saldo"
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
            >
              Conferir saldo
            </Link>
          </div>
        </div>
        <MonthSelector mes={mes} onChange={setMes} />
      </div>

      <ErroBanner mensagem={dash.erro} />

      {dash.loading ? (
        <SkeletonHome />
      ) : (
        <>
          {/* B. KPIs principais */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard
              label="Saldo disponível hoje"
              valor={dash.saldoDisponivel}
              explicacao="Só o que está conferido de verdade (Mercado Pago)"
              tooltip="Saldo real informado, sem somar nada previsto"
              cor="text-brand"
            />
            <KpiCard
              label="Entradas previstas"
              valor={dash.entradasPendentes}
              explicacao="Ganhos ainda não recebidos — o que já entrou não conta aqui de novo"
              tooltip="Soma dos ganhos da competência que ainda não foram marcados como recebidos"
              cor="text-positive"
            />
            <KpiCard
              label="Compromissos pendentes"
              valor={dash.compromissosPendentes}
              explicacao="Contas, assinaturas, parcelas, fatura e gastos ainda não pagos"
              tooltip="Soma das despesas da competência que ainda não foram marcadas como pagas"
              cor="text-gold"
            />
            <KpiCard
              label="Saldo projetado"
              valor={dash.saldoProjetado}
              explicacao="Disponível + previsto a receber − a pagar"
              tooltip="Saldo disponível + entradas previstas − compromissos pendentes"
              cor={
                dash.saldoProjetado !== null && dash.saldoProjetado < 0
                  ? "text-negative"
                  : "text-positive"
              }
              destaque
            />
          </div>

          {/* C. Central de atenção */}
          <div>
            <h2 className="text-sm font-medium text-text-muted mb-2">Central de atenção</h2>
            <FinanceActionCenter alertas={dash.alertas} />
          </div>

          {/* D. Fluxo de caixa */}
          <CashFlowChart pontos={dash.fluxoDiario} entries={dash.entries} />

          <div className="grid lg:grid-cols-2 gap-4">
            {/* E. Próximos vencimentos */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-medium text-text-muted">Próximos vencimentos</h2>
                <Link href="/checklist" className="text-xs text-brand hover:text-brand-dark">
                  Ver checklist
                </Link>
              </div>
              <UpcomingList itens={dash.proximosVencimentos} hojeISO={hojeISO()} />
            </div>

            {/* F. Distribuição de gastos */}
            <CategoryDonut grupos={dash.distribuicaoGastos} />
          </div>
        </>
      )}
    </div>
  );
}

function KpiCard({
  label,
  valor,
  explicacao,
  tooltip,
  cor,
  destaque,
}: {
  label: string;
  valor: number | null;
  explicacao: string;
  tooltip: string;
  cor: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        destaque ? "border-brand/25 bg-surface-elevated" : "border-line bg-surface"
      }`}
      title={tooltip}
    >
      <p className="text-xs text-text-faint">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${valor === null ? "text-text-faint" : cor}`}>
        {valor === null ? "—" : formatarMoeda(valor)}
      </p>
      <p className="text-[11px] text-text-faint mt-1">{explicacao}</p>
    </div>
  );
}
