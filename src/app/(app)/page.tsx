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
import { PageHeader } from "@/components/PageHeader";

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
        <PageHeader
          titulo="Resumo financeiro"
          descricao={`${formatarMes(mes)} · saldo conferido em ${formatarQuando(dash.ultimaAtualizacaoSaldo)}`}
        />
        <MonthSelector mes={mes} onChange={setMes} />
      </div>

      <ErroBanner mensagem={dash.erro} />

      {dash.loading ? (
        <SkeletonHome />
      ) : (
        <>
          {/* B. KPIs — o saldo ocupa a linha inteira porque é o número principal */}
          <div className="space-y-3">
            <KpiCard
              label="Saldo disponível hoje"
              valor={dash.saldoDisponivel}
              explicacao="Só o que está conferido de verdade — nunca soma previsão"
              tooltip="Saldo real informado, isolado — nunca soma entrada nem previsão nenhuma"
              cor="text-brand"
              destaque
            />
            <div className="grid grid-cols-2 gap-3">
              <KpiCard
                label="Entradas previstas"
                valor={dash.entradasPendentes}
                explicacao="Ainda não recebidas"
                tooltip="Soma dos ganhos da competência que ainda não foram marcados como recebidos"
                cor="text-positive"
              />
              <KpiCard
                label="A pagar"
                valor={dash.compromissosPendentes}
                explicacao="Contas, parcelas e fatura em aberto"
                tooltip="Soma das despesas da competência que ainda não foram marcadas como pagas"
                cor="text-gold"
              />
            </div>
          </div>

          {/* C. Atalhos das ações mais comuns */}
          <div className="grid grid-cols-3 gap-2">
            <AtalhoRapido href="/saldo" titulo="Gasto" descricao="registrar" />
            <AtalhoRapido href="/comissoes" titulo="Comissão" descricao="lançar dia" />
            <AtalhoRapido href="/checklist" titulo="Contas" descricao="marcar pagas" />
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

function AtalhoRapido({
  href,
  titulo,
  descricao,
}: {
  href: string;
  titulo: string;
  descricao: string;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[60px] flex-col items-center justify-center rounded-xl border border-line bg-surface px-2 py-2 text-center transition-colors hover:border-brand/40 active:bg-surface-2"
    >
      <span className="text-sm font-medium text-text">{titulo}</span>
      <span className="text-[11px] text-text-faint">{descricao}</span>
    </Link>
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
      <p className="text-[11px] text-text-faint">{label}</p>
      <p
        className={`mt-1 font-bold ${destaque ? "text-3xl" : "text-xl"} ${
          valor === null ? "text-text-faint" : cor
        }`}
      >
        {valor === null ? "—" : formatarMoeda(valor)}
      </p>
      <p className="mt-1 text-[11px] leading-snug text-text-faint">{explicacao}</p>
    </div>
  );
}
