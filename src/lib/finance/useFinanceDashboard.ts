"use client";

import { useMemo } from "react";
import { FinancialEntry, mesPadrao, parcelasRestantesEm } from "@/lib/types";
import { useGanhos } from "@/lib/useGanhos";
import { useContasFixas } from "@/lib/useContasFixas";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { useParcelas } from "@/lib/useParcelas";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { useCartoesConfig } from "@/lib/useCartoesConfig";
import { useGastos } from "@/lib/useGastos";
import { usePagamentos } from "@/lib/usePagamentos";
import { useSaldo } from "@/lib/useSaldo";
import { construirFinancialEntries } from "./adapters";
import {
  calculateAvailableBalance,
  calculateMonthlyCashFlow,
  calculatePendingIncome,
  calculatePendingExpenses,
  calculateUpcomingCommitments,
  calculateDailyCashFlow,
  ultimoDiaMes,
  hojeISO,
} from "./calculations";
import { gerarAlertas, FinanceAlert } from "./alerts";
import { groupByCategory, GrupoPorCategoria } from "./entries";

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
  const cartoesConfig = useCartoesConfig();
  const gastosHook = useGastos();
  const pagamentos = usePagamentos(mes);
  const saldoHook = useSaldo();

  const loading =
    ganhos.loading ||
    contas.loading ||
    assinaturas.loading ||
    parcelas.loading ||
    faturas.loading ||
    cartoesConfig.loading ||
    gastosHook.loading ||
    pagamentos.loading ||
    saldoHook.loading;

  const erro =
    ganhos.erro ||
    contas.erro ||
    assinaturas.erro ||
    parcelas.erro ||
    faturas.erro ||
    cartoesConfig.erro ||
    gastosHook.erro ||
    pagamentos.erro ||
    saldoHook.erro;

  const diaVencimentoPorCartao = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const c of cartoesConfig.configs) {
      if (c.diaVencimento) mapa[c.nome] = c.diaVencimento;
    }
    return mapa;
  }, [cartoesConfig.configs]);

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
      diaVencimentoPorCartao,
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
    diaVencimentoPorCartao,
  ]);

  const saldoReal = saldoHook.saldo ? saldoHook.saldo.valor : null;
  const saldoDisponivel = calculateAvailableBalance(saldoReal);
  const fluxoDoMes = useMemo(
    () => calculateMonthlyCashFlow(entries, mes),
    [entries, mes]
  );
  // Saldo é isolado de propósito (ver /saldo) — o valor que o usuário
  // informa lá já É o que sobrou depois de pagar tudo, não "dinheiro que
  // ainda vai entrar". "Entradas previstas" nunca deve ser somado a ele
  // em nenhum KPI/alerta daqui, senão o mesmo salário conta duas vezes.
  const entradasPendentes = useMemo(
    () => calculatePendingIncome(entries, mes),
    [entries, mes]
  );
  const compromissosPendentes = useMemo(
    () => calculatePendingExpenses(entries, mes),
    [entries, mes]
  );

  const proximosVencimentos = useMemo(
    () => calculateUpcomingCommitments(entries, hojeISO(), 30).slice(0, 5),
    [entries]
  );

  // Ajuste de conciliação normalmente cobre semanas de gasto não lançado
  // de uma vez só — incluído na distribuição por categoria, ele domina o
  // gráfico sozinho e não representa um padrão real de consumo do mês.
  // Fica de fora daqui (mas continua contando no DRE e no total do mês).
  const distribuicaoGastos: GrupoPorCategoria[] = useMemo(
    () =>
      groupByCategory(
        entries.filter((e) => e.type === "expense" && e.source !== "adjustment")
      ),
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
      hojeISO: hojeISO(),
      mes,
      saldoAtualizadoEm: saldoHook.saldo ? saldoHook.saldo.atualizadoEm : null,
      parcelasTerminando,
      assinaturasParaRevisar,
      totalFatura: faturas.total,
      rendaLiquidaMensal: ganhos.totalLiquido,
      entradasPendentes,
    });
  }, [
    loading,
    entries,
    mes,
    saldoHook.saldo,
    parcelasTerminando,
    entradasPendentes,
    assinaturasParaRevisar,
    faturas.total,
    ganhos.totalLiquido,
  ]);

  const fluxoDiario = useMemo(() => {
    if (loading || saldoReal === null) return [];
    return calculateDailyCashFlow(
      entries,
      `${mes}-01`,
      ultimoDiaMes(mes),
      saldoReal
    );
  }, [loading, entries, mes, saldoReal]);

  return {
    loading,
    erro,
    entries,
    saldoDisponivel,
    fluxoDoMes,
    entradasPendentes,
    compromissosPendentes,
    fluxoDiario,
    proximosVencimentos,
    distribuicaoGastos,
    alertas,
    ultimaAtualizacaoSaldo: saldoHook.saldo?.atualizadoEm ?? null,
  };
}
