"use client";

import { useMemo } from "react";
import { mesPadrao, FinancialEntry } from "@/lib/types";
import { useGanhos } from "@/lib/useGanhos";
import { useContasFixas } from "@/lib/useContasFixas";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { useParcelas } from "@/lib/useParcelas";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { useGastos } from "@/lib/useGastos";
import { usePagamentos } from "@/lib/usePagamentos";
import { construirFinancialEntries } from "./adapters";

function somarMes(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * A Agenda precisa enxergar além do mês corrente — um filtro de "próximos
 * 30 dias" pedido no dia 20 cruza pro mês seguinte. Busca fatura e
 * pagamentos do mês atual e do próximo (as outras coleções não são
 * mes-scoped no Firestore) e monta um único FinancialEntry[] cobrindo os
 * dois. Continua sem migrar nem duplicar nada — mesmo adapter da Home,
 * chamado duas vezes.
 */
export function useAgendaEntries() {
  const mesAtual = mesPadrao();
  const mesSeguinte = somarMes(mesAtual, 1);

  const ganhosAtual = useGanhos(mesAtual);
  const ganhosSeguinte = useGanhos(mesSeguinte);
  const contas = useContasFixas();
  const assinaturas = useAssinaturas();
  const parcelas = useParcelas();
  const faturasAtual = useFaturasCartao(mesAtual);
  const faturasSeguinte = useFaturasCartao(mesSeguinte);
  const gastosHook = useGastos();
  const pagamentosAtual = usePagamentos(mesAtual);
  const pagamentosSeguinte = usePagamentos(mesSeguinte);

  const loading =
    ganhosAtual.loading ||
    ganhosSeguinte.loading ||
    contas.loading ||
    assinaturas.loading ||
    parcelas.loading ||
    faturasAtual.loading ||
    faturasSeguinte.loading ||
    gastosHook.loading ||
    pagamentosAtual.loading ||
    pagamentosSeguinte.loading;

  const erro =
    ganhosAtual.erro ||
    ganhosSeguinte.erro ||
    contas.erro ||
    assinaturas.erro ||
    parcelas.erro ||
    faturasAtual.erro ||
    faturasSeguinte.erro ||
    gastosHook.erro ||
    pagamentosAtual.erro ||
    pagamentosSeguinte.erro;

  const entries: FinancialEntry[] = useMemo(() => {
    if (loading) return [];
    const doMesAtual = construirFinancialEntries({
      ganhos: [...ganhosAtual.recorrentes, ...ganhosAtual.pontuais],
      contas: contas.contas,
      assinaturas: assinaturas.assinaturas,
      parcelas: parcelas.parcelas,
      faturas: faturasAtual.faturas,
      gastos: gastosHook.gastos,
      estaPago: pagamentosAtual.estaPago,
      mes: mesAtual,
    });
    const doMesSeguinte = construirFinancialEntries({
      ganhos: [...ganhosSeguinte.recorrentes, ...ganhosSeguinte.pontuais],
      contas: contas.contas,
      assinaturas: assinaturas.assinaturas,
      parcelas: parcelas.parcelas,
      faturas: faturasSeguinte.faturas,
      gastos: gastosHook.gastos,
      estaPago: pagamentosSeguinte.estaPago,
      mes: mesSeguinte,
    });
    return [...doMesAtual, ...doMesSeguinte];
  }, [
    loading,
    ganhosAtual.recorrentes,
    ganhosAtual.pontuais,
    ganhosSeguinte.recorrentes,
    ganhosSeguinte.pontuais,
    contas.contas,
    assinaturas.assinaturas,
    parcelas.parcelas,
    faturasAtual.faturas,
    faturasSeguinte.faturas,
    gastosHook.gastos,
    pagamentosAtual.estaPago,
    pagamentosSeguinte.estaPago,
    mesAtual,
    mesSeguinte,
  ]);

  return { entries, loading, erro, mesAtual, mesSeguinte };
}
