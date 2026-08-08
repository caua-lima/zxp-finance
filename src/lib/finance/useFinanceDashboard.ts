"use client";

import { useMemo } from "react";
import { FinancialEntry, mesPadrao, parcelasRestantesEm } from "@/lib/types";
import { useGanhos } from "@/lib/useGanhos";
import { useContasFixas } from "@/lib/useContasFixas";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { useParcelas } from "@/lib/useParcelas";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { useGastos } from "@/lib/useGastos";
import { usePagamentos } from "@/lib/usePagamentos";
import { useSaldo } from "@/lib/useSaldo";
import { construirFinancialEntries } from "./adapters";
import {
  calculateAvailableBalance,
  calculateProjectedBalance,
  calculateMonthlyCashFlow,
  calculateUpcomingCommitments,
  calculateDailyCashFlow,
  ultimoDiaMes,
} from "./calculations";
import { gerarAlertas, FinanceAlert } from "./alerts";
import { groupByCategory, GrupoPorCategoria } from "./entries";

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Visão consolidada usada pela Home. Combina os hooks antigos (fonte real
 * dos dados) com o modelo FinancialEntry pra entregar KPIs, alertas, fluxo
 * de caixa e próximos vencimentos prontos pra tela, sem duplicar lógica de
 * negócio — tudo delega pra src/lib/finance/*.
 */
export function useFinanceDashboard(mes: string = mesPadrao()) {
  const ganhos = useGanhos(mes);
  const contas = useContasFixas();
  const assinaturas = useAssinaturas();
  const parcelas = useParcelas();
  const faturas = useFaturasCartao(mes);
  const gastosHook = useGastos();
  const pagamentos = usePagamentos(mes);
  const saldoHook = useSaldo();

  const loading =
    ganhos.loading ||
    contas.loading ||
    assinaturas.loading ||
    parcelas.loading ||
    faturas.loading ||
    gastosHook.loading ||
    pagamentos.loading ||
    saldoHook.loading;

  const erro =
    ganhos.erro ||
    contas.erro ||
    assinaturas.erro ||
    parcelas.erro ||
    faturas.erro ||
    gastosHook.erro ||
    pagamentos.erro ||
    saldoHook.erro;

  const entries: FinancialEntry[] = useMemo(() => {
    if (loading) return [];
    return construirFinancialEntries({
      ganhos: [...ganhos.recorrentes, ...ganhos.pontuais],
      contas: contas.contas,
      assinaturas: assinaturas.assinaturas,
      parcelas: parcelas.parcelas,
      faturas: faturas.faturas,
      gastos: gastosHook.gastos,
      estaPago: pagamentos.estaPago,
      mes,
    });
  }, [
    loading,
    ganhos.recorrentes,
    ganhos.pontuais,
    contas.contas,
    assinaturas.assinaturas,
    parcelas.parcelas,
    faturas.faturas,
    gastosHook.gastos,
    pagamentos.estaPago,
    mes,
  ]);

  const saldoReal = saldoHook.saldo ? saldoHook.saldo.valor : null;
  const saldoDisponivel = calculateAvailableBalance(saldoReal);
  const saldoProjetado = calculateProjectedBalance(saldoReal, entries, mes);
  const fluxoDoMes = useMemo(
    () => calculateMonthlyCashFlow(entries, mes),
    [entries, mes]
  );

  const proximosVencimentos = useMemo(
    () => calculateUpcomingCommitments(entries, hojeISO(), 30).slice(0, 5),
    [entries]
  );

  const distribuicaoGastos: GrupoPorCategoria[] = useMemo(
    () => groupByCategory(entries.filter((e) => e.type === "expense")),
    [entries]
  );

  const parcelasTerminando = useMemo(
    () =>
      parcelas.parcelas
        .filter((p) => !p.naFatura && parcelasRestantesEm(p, mes) === 1)
        .map((p) => ({ id: p.id, nome: p.nome })),
    [parcelas.parcelas, mes]
  );

  const assinaturasParaRevisar = useMemo(
    () =>
      assinaturas.assinaturas
        .filter((a) => a.ativa && a.usoPercebido === "revisar")
        .map((a) => ({ id: a.id, nome: a.nome })),
    [assinaturas.assinaturas]
  );

  const alertas: FinanceAlert[] = useMemo(() => {
    if (loading) return [];
    return gerarAlertas({
      entries,
      saldoProjetado,
      hojeISO: hojeISO(),
      mes,
      saldoAtualizadoEm: saldoHook.saldo ? saldoHook.saldo.atualizadoEm : null,
      parcelasTerminando,
      assinaturasParaRevisar,
    });
  }, [
    loading,
    entries,
    saldoProjetado,
    mes,
    saldoHook.saldo,
    parcelasTerminando,
    assinaturasParaRevisar,
  ]);

  const fluxoDiario = useMemo(() => {
    if (loading || saldoReal === null) return [];
    const hoje = new Date();
    const inicio = new Date(hoje);
    inicio.setDate(1);
    return calculateDailyCashFlow(
      entries,
      inicio.toISOString().slice(0, 10),
      ultimoDiaMes(mes),
      saldoReal
    );
  }, [loading, entries, mes, saldoReal]);

  return {
    loading,
    erro,
    entries,
    saldoDisponivel,
    saldoProjetado,
    fluxoDoMes,
    fluxoDiario,
    proximosVencimentos,
    distribuicaoGastos,
    alertas,
    ultimaAtualizacaoSaldo: saldoHook.saldo?.atualizadoEm ?? null,
  };
}
