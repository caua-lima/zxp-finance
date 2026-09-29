"use client";

import { useState } from "react";
import Link from "next/link";
import { FinancialEntry, formatarMoeda, formatarMes, mesPadrao } from "@/lib/types";
import { useFinanceDashboard } from "@/lib/finance/useFinanceDashboard";
import { hojeISO, isEntryPaid, LinhaCompromisso } from "@/lib/finance/calculations";
import { MonthSelector } from "@/components/MonthSelector";
import { ErroBanner } from "@/components/ErroBanner";
import { FinanceActionCenter } from "@/components/FinanceActionCenter";
import { CashFlowChart } from "@/components/CashFlowChart";
import { UpcomingList } from "@/components/UpcomingList";
import { CategoryDonut } from "@/components/CategoryDonut";
import { SkeletonHome } from "@/components/Skeleton";
import { PageHeader } from "@/components/PageHeader";

const HREF_COMPROMISSO: Record<LinhaCompromisso["chave"], string> = {
  contas: "/contas",
  parcelas: "/parcelas",
  faturas: "/fatura",
  assinaturas: "/assinaturas",
};

export default function DashboardPage() {
  const [mes, setMes] = useState(mesPadrao());
  const dash = useFinanceDashboard(mes);

  const entradasDoMes = dash.entries.filter(
    (e) => e.type === "income" && e.competenceMonth === mes
  );
  const sobraPrevista = dash.entradasPendentes - dash.compromissosPendentes;

  return (
    <div className="space-y-4">
      <div>
        <PageHeader titulo="Resumo" descricao={formatarMes(mes)} />
        <MonthSelector mes={mes} onChange={setMes} />
      </div>

      <ErroBanner mensagem={dash.erro} />

      {dash.loading ? (
        <SkeletonHome />
      ) : (
        <>
          {/* saldo — o número do dia a dia, com atalho pra tela onde ele mora */}
          <Link
            href="/saldo"
            className="block rounded-2xl border border-brand/25 bg-surface-elevated p-4 transition-colors active:bg-surface-2"
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-faint">
                Saldo na conta agora
              </p>
              <span className="text-xs text-brand">Saldo e gastos →</span>
            </div>
            <p
              className={`mt-1 text-3xl font-bold tracking-tight ${
                dash.saldoDisponivel === null
                  ? "text-text-faint"
                  : dash.saldoDisponivel < 0
                  ? "text-negative"
                  : "text-brand"
              }`}
            >
              {dash.saldoDisponivel === null ? "—" : formatarMoeda(dash.saldoDisponivel)}
            </p>
          </Link>

          {/* o mês em três números: o que entra, o que sai, o que sobra */}
          <div className="grid grid-cols-3 gap-2">
            <Numero titulo="Vai entrar" valor={dash.entradasPendentes} cor="text-positive" />
            <Numero titulo="Falta pagar" valor={dash.compromissosPendentes} cor="text-gold" />
            <Numero
              titulo="Sobra"
              valor={sobraPrevista}
              cor={sobraPrevista >= 0 ? "text-text" : "text-negative"}
            />
          </div>

          <QuantoPagar mes={mes} compromissos={dash.compromissos} />

          <Entradas mes={mes} entradas={entradasDoMes} />

          {/* boa notícia: parcela terminando é dinheiro que volta todo mês */}
          {dash.liberando.totalMensal > 0 && (
            <div className="rounded-2xl border border-positive/25 bg-positive-soft/40 p-4">
              <p className="text-sm font-semibold text-positive">
                +{formatarMoeda(dash.liberando.totalMensal)} por mês a partir do mês que vem
              </p>
              <p className="mt-1 text-xs text-text-muted">
                {dash.liberando.parcelas.length === 1
                  ? `A última parcela de ${dash.liberando.parcelas[0].nome} cai neste mês.`
                  : `${dash.liberando.parcelas.length} parcelas terminam neste mês: ${dash.liberando.parcelas
                      .map((p) => p.nome)
                      .join(", ")}.`}
              </p>
            </div>
          )}

          {dash.alertas.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-medium text-text-muted">Precisa de atenção</h2>
              <FinanceActionCenter alertas={dash.alertas} />
            </div>
          )}

          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium text-text-muted">Próximos vencimentos</h2>
              <Link href="/checklist" className="text-xs text-brand hover:text-brand-dark">
                Marcar pagas
              </Link>
            </div>
            <UpcomingList itens={dash.proximosVencimentos} hojeISO={hojeISO()} />
          </div>

          <CashFlowChart pontos={dash.fluxoDiario} entries={dash.entries} />
          <CategoryDonut grupos={dash.distribuicaoGastos} />
        </>
      )}
    </div>
  );
}

function Numero({ titulo, valor, cor }: { titulo: string; valor: number; cor: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-3">
      <p className="text-[11px] text-text-faint">{titulo}</p>
      <p className={`mt-0.5 text-base font-bold leading-tight ${cor}`}>{formatarMoeda(valor)}</p>
    </div>
  );
}

/**
 * "Quanto eu tenho que pagar esse mês?" — contas fixas, parcelas, faturas e
 * assinaturas separadas, cada uma com o que já foi pago. Fatura ainda não
 * lançada entra como prevista (parcelas e assinaturas já conhecidas do
 * cartão), senão os compromissos do mês que vem simplesmente sumiam.
 */
function QuantoPagar({
  mes,
  compromissos,
}: {
  mes: string;
  compromissos: {
    linhas: LinhaCompromisso[];
    total: number;
    pago: number;
    falta: number;
  };
}) {
  if (compromissos.linhas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-text-faint">
        Nenhuma conta, parcela ou fatura em {formatarMes(mes).split(" ")[0].toLowerCase()}.
      </div>
    );
  }
  const temEstimado = compromissos.linhas.some((l) => l.estimado > 0);
  const progresso = compromissos.total > 0 ? (compromissos.pago / compromissos.total) * 100 : 0;

  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Contas do mês</h2>
        <span className="text-lg font-bold text-gold">{formatarMoeda(compromissos.total)}</span>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-positive" style={{ width: `${progresso}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-text-faint">
        {formatarMoeda(compromissos.pago)} pago · falta {formatarMoeda(compromissos.falta)}
      </p>

      <ul className="mt-3 divide-y divide-line-soft">
        {compromissos.linhas.map((l) => (
          <li key={l.chave}>
            <Link
              href={HREF_COMPROMISSO[l.chave]}
              className="flex items-center justify-between gap-3 py-2.5 active:opacity-70"
            >
              <div className="min-w-0">
                <p className="text-sm">
                  {l.titulo}
                  {l.estimado > 0 && (
                    <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 py-0.5 text-[10px] text-text-faint">
                      prevista
                    </span>
                  )}
                </p>
                <p className="text-[11px] text-text-faint">
                  {l.falta <= 0 ? "✓ tudo pago" : `falta ${formatarMoeda(l.falta)}`}
                </p>
              </div>
              <span className="shrink-0 text-sm font-medium">{formatarMoeda(l.total)}</span>
            </Link>
          </li>
        ))}
      </ul>

      {temEstimado && (
        <p className="mt-2 text-[11px] leading-relaxed text-text-faint">
          Fatura prevista = parcelas e assinaturas que você já cadastrou naquele cartão. Quando
          lançar o valor real da fatura, ele substitui a previsão.
        </p>
      )}
    </div>
  );
}

function Entradas({ mes, entradas }: { mes: string; entradas: FinancialEntry[] }) {
  if (entradas.length === 0) return null;
  const mesCurto = formatarMes(mes).split(" ")[0].toLowerCase();
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Entradas de {mesCurto}</h2>
      <ul className="mt-2 divide-y divide-line-soft">
        {entradas.map((e) => {
          const recebido = isEntryPaid(e);
          return (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm">{e.description}</p>
                <p className="text-[11px] text-text-faint">
                  {recebido ? "✓ recebido" : e.estimado ? "previsto · já sem o imposto" : "a receber"}
                </p>
              </div>
              <span
                className={`shrink-0 text-sm font-medium ${
                  recebido ? "text-text-faint" : "text-positive"
                }`}
              >
                {formatarMoeda(e.amount)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
