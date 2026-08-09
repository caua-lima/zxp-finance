"use client";

import { useMemo } from "react";
import { FinancialEntry } from "@/lib/types";
import { useGanhos } from "@/lib/useGanhos";
import { useContasFixas } from "@/lib/useContasFixas";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { useParcelas } from "@/lib/useParcelas";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { useCartoesConfig } from "@/lib/useCartoesConfig";
import { useGastos } from "@/lib/useGastos";
import { usePagamentos } from "@/lib/usePagamentos";
import { construirFinancialEntries } from "./adapters";
import { calculateDreBreakdown, DreBreakdown } from "./calculations";

function mesAnteriorDe(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  const d = new Date(ano, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Monta o DRE do mês selecionado e do mês anterior (pra comparação),
 * reusando o mesmo adapter da Home/Agenda. Contas, assinaturas e
 * parcelas não são mes-scoped no Firestore, então os mesmos dados
 * alimentam os dois cálculos — só fatura e pagamentos precisam de uma
 * busca por mês.
 */
export function useDreComparativo(mes: string) {
  const mesAnterior = mesAnteriorDe(mes);

  const ganhosAtual = useGanhos(mes);
  const ganhosAnterior = useGanhos(mesAnterior);
  const contas = useContasFixas();
  const assinaturas = useAssinaturas();
  const parcelas = useParcelas();
  const faturasAtual = useFaturasCartao(mes);
  const faturasAnterior = useFaturasCartao(mesAnterior);
  const cartoesConfig = useCartoesConfig();
  const gastosHook = useGastos();
  const pagamentosAtual = usePagamentos(mes);
  const pagamentosAnterior = usePagamentos(mesAnterior);

  const loading =
    ganhosAtual.loading ||
    ganhosAnterior.loading ||
    contas.loading ||
    assinaturas.loading ||
    parcelas.loading ||
    faturasAtual.loading ||
    faturasAnterior.loading ||
    cartoesConfig.loading ||
    gastosHook.loading ||
    pagamentosAtual.loading ||
    pagamentosAnterior.loading;

  const erro =
    ganhosAtual.erro ||
    ganhosAnterior.erro ||
    contas.erro ||
    assinaturas.erro ||
    parcelas.erro ||
    faturasAtual.erro ||
    faturasAnterior.erro ||
    cartoesConfig.erro ||
    gastosHook.erro ||
    pagamentosAtual.erro ||
    pagamentosAnterior.erro;

  const diaVencimentoPorCartao = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const c of cartoesConfig.configs) {
      if (c.diaVencimento) mapa[c.nome] = c.diaVencimento;
    }
    return mapa;
  }, [cartoesConfig.configs]);

  const entriesAtual: FinancialEntry[] = useMemo(() => {
    if (loading) return [];
    return construirFinancialEntries({
      ganhos: [...ganhosAtual.recorrentes, ...ganhosAtual.pontuais],
      contas: contas.contas,
      assinaturas: assinaturas.assinaturas,
      parcelas: parcelas.parcelas,
      faturas: faturasAtual.faturas,
      gastos: gastosHook.gastos,
      estaPago: pagamentosAtual.estaPago,
      mes,
      diaVencimentoPorCartao,
    });
  }, [
    loading,
    ganhosAtual.recorrentes,
    ganhosAtual.pontuais,
    contas.contas,
    assinaturas.assinaturas,
    parcelas.parcelas,
    faturasAtual.faturas,
    gastosHook.gastos,
    pagamentosAtual.estaPago,
    mes,
    diaVencimentoPorCartao,
  ]);

  const entriesAnterior: FinancialEntry[] = useMemo(() => {
    if (loading) return [];
    return construirFinancialEntries({
      ganhos: [...ganhosAnterior.recorrentes, ...ganhosAnterior.pontuais],
      contas: contas.contas,
      assinaturas: assinaturas.assinaturas,
      parcelas: parcelas.parcelas,
      faturas: faturasAnterior.faturas,
      gastos: gastosHook.gastos,
      estaPago: pagamentosAnterior.estaPago,
      mes: mesAnterior,
      diaVencimentoPorCartao,
    });
  }, [
    loading,
    ganhosAnterior.recorrentes,
    ganhosAnterior.pontuais,
    contas.contas,
    assinaturas.assinaturas,
    parcelas.parcelas,
    faturasAnterior.faturas,
    gastosHook.gastos,
    pagamentosAnterior.estaPago,
    mesAnterior,
    diaVencimentoPorCartao,
  ]);

  const atual: DreBreakdown = useMemo(() => calculateDreBreakdown(entriesAtual), [entriesAtual]);
  const anterior: DreBreakdown = useMemo(
    () => calculateDreBreakdown(entriesAnterior),
    [entriesAnterior]
  );

  return { entriesAtual, entriesAnterior, atual, anterior, mesAnterior, loading, erro };
}
