import { Gasto, arredondarCentavos, contaNoPeriodo } from "@/lib/types";
import { dataEfetivaDoGasto } from "./saldo";

/**
 * Relatório só dos gastos que você lança no dia a dia (chat/Gastos) — sem
 * contas fixas, parcelas e faturas, que o DRE já mostra à parte. Ajuste
 * antigo de conciliação e estorno ficam fora; "Investimentos não registrados"
 * (reajuste de saldo) entra, porque é dinheiro que saiu.
 */
export interface ResumoGastosDiarios {
  total: number;
  quantidade: number;
  /** Dias do mês com pelo menos um gasto. */
  diasComGasto: number;
  /** Total ÷ dias decorridos do mês (até hoje, ou o mês inteiro se já passou). */
  mediaPorDia: number;
  porCategoria: { categoria: string; total: number; quantidade: number }[];
  /** Mais recente primeiro. */
  porDia: { dia: string; total: number; quantidade: number }[];
  maiorDia: { dia: string; total: number } | null;
}

export function resumoGastosDiarios(gastos: Gasto[], mes: string, hojeISO: string): ResumoGastosDiarios {
  const doMes = gastos.filter(
    (g) =>
      g.mes === mes &&
      !g.ajusteConciliacaoId &&
      !g.estornado &&
      !g.estornoDeId &&
      contaNoPeriodo(dataEfetivaDoGasto(g))
  );
  const categorias = new Map<string, { total: number; quantidade: number }>();
  const dias = new Map<string, { total: number; quantidade: number }>();
  for (const g of doMes) {
    const c = categorias.get(g.categoria) ?? { total: 0, quantidade: 0 };
    categorias.set(g.categoria, { total: c.total + g.valor, quantidade: c.quantidade + 1 });
    const dia = dataEfetivaDoGasto(g);
    const d = dias.get(dia) ?? { total: 0, quantidade: 0 };
    dias.set(dia, { total: d.total + g.valor, quantidade: d.quantidade + 1 });
  }
  const total = arredondarCentavos(doMes.reduce((acc, g) => acc + g.valor, 0));
  const porDia = [...dias.entries()]
    .map(([dia, v]) => ({ dia, total: arredondarCentavos(v.total), quantidade: v.quantidade }))
    .sort((a, b) => b.dia.localeCompare(a.dia));
  const [ano, m] = mes.split("-").map(Number);
  const diasDoMes = new Date(ano, m, 0).getDate();
  const mesAtual = hojeISO.slice(0, 7);
  const decorridos =
    mes < mesAtual ? diasDoMes : mes > mesAtual ? 0 : Number(hojeISO.slice(8, 10));
  const maior = porDia.reduce<{ dia: string; total: number } | null>(
    (acc, d) => (!acc || d.total > acc.total ? { dia: d.dia, total: d.total } : acc),
    null
  );
  return {
    total,
    quantidade: doMes.length,
    diasComGasto: porDia.length,
    mediaPorDia: decorridos > 0 ? arredondarCentavos(total / decorridos) : 0,
    porCategoria: [...categorias.entries()]
      .map(([categoria, v]) => ({
        categoria,
        total: arredondarCentavos(v.total),
        quantidade: v.quantidade,
      }))
      .sort((a, b) => b.total - a.total),
    porDia,
    maiorDia: maior,
  };
}
