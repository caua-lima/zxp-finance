import type { Ganho, Gasto } from "@/lib/types";
import { diaISOde } from "@/lib/finance/calculations";
import { normalizarTexto } from "@/lib/categoriasGasto";
import type { ContaPluggy, TransacaoPluggy } from "./cliente";
import {
  categoriaDaEntrada,
  categoriaDoGasto,
  descricaoLimpa,
  ehMovimentoInterno,
  ehParaVoceMesmo,
  ehRendimento,
  reservaDaTransacao,
} from "./plano";

/**
 * O extrato do banco lido como "pra onde foi o dinheiro": cada transação
 * vira gasto, entrada, reserva (caixinha), movimento interno ou estorno —
 * as mesmas regras da sincronização (plano.ts). É a base do relatório
 * mensal e das perguntas do Consultor.
 */

export type TipoLinha = "saida" | "entrada" | "reserva" | "interno" | "estorno";

export interface LinhaExtrato {
  tipo: TipoLinha;
  mes: string;
  dia: string;
  valor: number;
  /** Descrição limpa (nome do lugar ou da pessoa). */
  descricao: string;
  /** Texto original do banco. */
  original: string;
  categoria: string;
  categoriaBanco: string | null;
  /** Saída: "conta" (débito/Pix/boleto) ou "cartao" (crédito). */
  meio?: "conta" | "cartao";
  /** Reserva: nome da caixinha e direção. */
  caixinha?: string;
  direcao?: "guardar" | "resgatar";
  /** Interno: tipo do movimento. */
  subtipo?: "para_voce_enviado" | "para_voce_recebido" | "fatura" | "outro";
  /** Estorno: dinheiro voltou (anula uma saída) ou saiu (anula uma entrada). */
  anula?: "saida" | "entrada";
}

const ESTORNO = /^(reembolso de (pix|transfer[eê]ncia) enviad|cancelamento de pix|estorno)/i;
const PIX_PESSOA = /^(pix enviado|pagamento com (qr )?pix|pix)\b/i;
const EMPRESA = /\b(ltda|s\.?a\.?|comercio|servicos|eireli|me|epp)\b/i;

/** Categoria extra do relatório: Pix pra pessoa física sem categoria conhecida. */
export const PIX_PARA_PESSOAS = "Pix para pessoas";

export function classificarExtrato(
  transacoes: TransacaoPluggy[],
  contas: ContaPluggy[],
  historico: { gastos: Gasto[]; ganhos: Ganho[] }
): LinhaExtrato[] {
  const conta = new Map(contas.map((c) => [c.id, c]));
  const titulares = [
    ...new Set(contas.map((c) => (c as ContaPluggy & { owner?: string | null }).owner).filter((n): n is string => !!n)),
  ];
  const linhas: LinhaExtrato[] = [];
  for (const tx of transacoes) {
    const c = conta.get(tx.accountId);
    if (!c) continue;
    // compra no cartão fica pendente até a fatura fechar: conta já
    if (tx.status === "PENDING" && !(c.type === "CREDIT" && tx.amount > 0)) continue;
    const dia = diaISOde(Date.parse(tx.date));
    const base = {
      mes: dia.slice(0, 7), dia, valor: Math.abs(tx.amount), original: tx.description,
      categoriaBanco: tx.category ?? null, descricao: descricaoLimpa(tx), categoria: "",
    };
    const reserva = reservaDaTransacao(tx);
    if (reserva) {
      linhas.push({ ...base, tipo: "reserva", caixinha: reserva.nome, direcao: reserva.direcao });
      continue;
    }
    if (c.type === "CREDIT") {
      if (tx.amount > 0) {
        linhas.push({ ...base, tipo: "saida", meio: "cartao", categoria: categoriaDoGasto(tx, base.descricao, historico.gastos) });
      } else {
        linhas.push({ ...base, tipo: "interno", subtipo: "fatura" });
      }
      continue;
    }
    const saida = tx.amount < 0;
    if (ehParaVoceMesmo(tx, titulares) || /same person/i.test(tx.category ?? "")) {
      linhas.push({ ...base, tipo: "interno", subtipo: saida ? "para_voce_enviado" : "para_voce_recebido" });
      continue;
    }
    if (/pagamento (de )?fatura/i.test(tx.description) || /credit card payment/i.test(tx.category ?? "")) {
      linhas.push({ ...base, tipo: "interno", subtipo: "fatura" });
      continue;
    }
    if (!saida && ehRendimento(tx)) {
      linhas.push({ ...base, tipo: "entrada", categoria: "Rendimentos", descricao: "Rendimentos da conta" });
      continue;
    }
    if (ESTORNO.test(tx.description)) {
      const quem = base.descricao.replace(/^(reembolso de (pix|transfer[eê]ncia) enviad[oa]|cancelamento de pix recebido)\s*/i, "");
      linhas.push({ ...base, tipo: "estorno", anula: saida ? "entrada" : "saida", descricao: quem });
      continue;
    }
    if (ehMovimentoInterno(tx, titulares)) {
      linhas.push({ ...base, tipo: "interno", subtipo: "outro" });
      continue;
    }
    if (!saida) {
      linhas.push({ ...base, tipo: "entrada", categoria: categoriaDaEntrada(tx, base.descricao, historico.ganhos) });
      continue;
    }
    let categoria = categoriaDoGasto(tx, base.descricao, historico.gastos);
    if (/votorantim|bv financeira|financiamento/i.test(tx.description)) categoria = "Financiamento";
    if (categoria === "Outros" && /office supplies|mercadolivre|shpp|shopee/i.test(`${tx.category} ${tx.description}`))
      categoria = "Compras";
    if (categoria === "Outros" && PIX_PESSOA.test(tx.description) && !EMPRESA.test(tx.description))
      categoria = PIX_PARA_PESSOAS;
    linhas.push({ ...base, tipo: "saida", meio: "conta", categoria });
  }
  return linhas;
}

/**
 * Pix devolvido abate o próprio gasto (mesma pessoa/lugar, mesmo mês).
 * Devolve as saídas já líquidas — o que é usado em totais.
 */
export function saidasLiquidas(linhas: LinhaExtrato[]): LinhaExtrato[] {
  const saidas = linhas.filter((l) => l.tipo === "saida").map((l) => ({ ...l }));
  for (const e of linhas.filter((l) => l.tipo === "estorno" && l.anula === "saida")) {
    const alvo = normalizarTexto(e.descricao);
    let resto = e.valor;
    for (const s of saidas) {
      if (resto <= 0.004 || s.mes !== e.mes || !alvo) continue;
      const nome = normalizarTexto(s.descricao);
      if (!nome.includes(alvo) && !alvo.includes(nome)) continue;
      const tira = Math.min(resto, s.valor);
      s.valor = Math.round((s.valor - tira) * 100) / 100;
      resto -= tira;
    }
  }
  return saidas.filter((s) => s.valor > 0.004);
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Busca gastos por texto e/ou categoria, como "quanto gastei de iFood". */
export function buscarGastos(
  linhas: LinhaExtrato[],
  filtro: { termo?: string; categoria?: string; meses: string[] }
) {
  const termo = filtro.termo ? normalizarTexto(filtro.termo).trim() : "";
  const categoria = filtro.categoria ? normalizarTexto(filtro.categoria).trim() : "";
  const achados = saidasLiquidas(linhas).filter(
    (l) =>
      filtro.meses.includes(l.mes) &&
      (!termo || normalizarTexto(`${l.descricao} ${l.original}`).includes(termo)) &&
      (!categoria || normalizarTexto(l.categoria) === categoria)
  );
  const porMes = filtro.meses.map((mes) => {
    const doMes = achados.filter((l) => l.mes === mes);
    return { mes, total: r2(doMes.reduce((a, l) => a + l.valor, 0)), quantidade: doMes.length };
  });
  const total = r2(achados.reduce((a, l) => a + l.valor, 0));
  return {
    total,
    quantidade: achados.length,
    mediaPorMes: r2(total / Math.max(1, filtro.meses.length)),
    porMes,
    maiores: [...achados]
      .sort((a, b) => b.valor - a.valor)
      .slice(0, 8)
      .map((l) => ({ data: l.dia, descricao: l.descricao, valor: l.valor, categoria: l.categoria })),
    categoriasEncontradas: [...new Set(achados.map((l) => l.categoria))],
  };
}

/** Resumo de um mês: receita, gastos por categoria, caixinhas e movimentos internos. */
export function resumoDoMes(linhas: LinhaExtrato[], mes: string) {
  const doMes = linhas.filter((l) => l.mes === mes);
  const soma = (f: (l: LinhaExtrato) => boolean) => r2(doMes.filter(f).reduce((a, l) => a + l.valor, 0));
  const saidas = saidasLiquidas(doMes);
  const porCategoria: Record<string, number> = {};
  for (const s of saidas) porCategoria[s.categoria] = r2((porCategoria[s.categoria] ?? 0) + s.valor);
  const gastos = r2(saidas.reduce((a, s) => a + s.valor, 0));
  const receita = soma((l) => l.tipo === "entrada");
  return {
    mes,
    receitaDeTerceiros: receita,
    gastos,
    gastosNoCartao: r2(saidas.filter((s) => s.meio === "cartao").reduce((a, s) => a + s.valor, 0)),
    porCategoria: Object.fromEntries(Object.entries(porCategoria).sort((a, b) => b[1] - a[1])),
    vindoDasSuasContas: soma((l) => l.subtipo === "para_voce_recebido"),
    enviadoParaSuasContas: soma((l) => l.subtipo === "para_voce_enviado"),
    guardadoNasCaixinhas: r2(soma((l) => l.tipo === "reserva" && l.direcao === "guardar") - soma((l) => l.tipo === "reserva" && l.direcao === "resgatar")),
  };
}
