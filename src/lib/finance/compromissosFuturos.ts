import { mesSeguinte, arredondarCentavos } from "@/lib/types";
import { construirFinancialEntries, DadosFinanceiros } from "./adapters";

/**
 * Quanto já está comprometido em cada um dos próximos `n` meses — contas
 * fixas, assinaturas, parcelas fora do cartão E faturas (reais ou
 * previstas, com as parcelas do cartão dentro). Monta tudo com os MESMOS
 * adapters do Resumo, então o Consultor enxerga exatamente o que o painel
 * mostra (auditoria F15: antes ele ignorava as parcelas do cartão e usava
 * um número de parcelas restantes congelado).
 *
 * Gasto do dia a dia não entra: é variável e já está no saldo.
 */
export function compromissosPorMes(
  dados: Omit<DadosFinanceiros, "mes" | "estaPago" | "comissoes">,
  mesAtual: string,
  n: number
): number[] {
  const resultado: number[] = [];
  let mes = mesAtual;
  for (let i = 0; i < n; i++) {
    mes = mesSeguinte(mes);
    const entries = construirFinancialEntries({
      ...dados,
      mes,
      // mês futuro: nada pago ainda
      estaPago: () => false,
    });
    const total = entries
      .filter((e) => e.type === "expense" && e.source !== "manual" && e.source !== "adjustment")
      .reduce((acc, e) => acc + e.amount, 0);
    resultado.push(arredondarCentavos(total));
  }
  return resultado;
}
