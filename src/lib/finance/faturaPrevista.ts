import {
  Parcela,
  Assinatura,
  arredondarCentavos,
  parcelasRestantesEm,
} from "@/lib/types";
import { vencimentoEfetivo } from "./diasUteis";
import { recorrenciaNoMes, valorNoMes } from "./recorrencia";

/**
 * Fatura prevista: o piso do que o cartão vai cobrar num mês em que a
 * fatura real ainda não foi lançada, montado das parcelas e assinaturas
 * que você já disse que estão nele.
 *
 * Existe porque parcela "já na fatura" não conta sozinha (senão contaria
 * duas vezes quando a fatura real fosse lançada) — e aí, num mês futuro
 * sem fatura lançada, esses compromissos simplesmente sumiam do "A pagar",
 * mesmo sendo dinheiro já comprometido. Quando a fatura real é lançada, a
 * prevista sai de cena e vale o valor real.
 *
 * Usa o valor cheio da parcela (não "sua parte"), porque é o que o cartão
 * cobra — igual à fatura real que você lança.
 */

/** Chave usada pras parcelas marcadas "na fatura" sem cartão informado. */
export const CARTAO_NAO_INFORMADO = "Cartão não informado";

export interface ItemFaturaPrevista {
  nome: string;
  valor: number;
  origem: "parcela" | "assinatura" | "compra";
}

/** Compra registrada no crédito, já com o mês da fatura em que cai. */
export interface CompraNoCredito {
  nome: string;
  valor: number;
  cartao: string;
  mesFatura: string;
}

function somarMes(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Em que fatura (mês de vencimento) cai uma compra no crédito (auditoria
 * 25/10 D29). Compra até o dia de fechamento entra na fatura que fecha
 * naquele mês; depois, na do mês seguinte. Vencimento depois do
 * fechamento = mesmo mês do fechamento; antes = mês seguinte. Sem dia de
 * fechamento cadastrado, supõe o mais comum: vence no mês seguinte.
 */
export function mesDaFaturaDaCompra(dataISO: string, diaFechamento?: number, diaVencimento?: number): string {
  const mes = dataISO.slice(0, 7);
  if (!diaFechamento || !diaVencimento) return somarMes(mes, 1);
  const dia = Number(dataISO.slice(8, 10));
  const mesFechamento = dia <= diaFechamento ? mes : somarMes(mes, 1);
  return diaVencimento > diaFechamento ? mesFechamento : somarMes(mesFechamento, 1);
}

export interface FaturaPrevista {
  cartao: string;
  total: number;
  itens: ItemFaturaPrevista[];
}

/** Composição da fatura prevista de um cartão num mês. */
export function composicaoFaturaPrevista(
  cartao: string,
  mes: string,
  parcelas: Parcela[],
  assinaturas: Assinatura[],
  compras: CompraNoCredito[] = []
): FaturaPrevista {
  const itens: ItemFaturaPrevista[] = [];

  // compras registradas no crédito: entram na fatura do ciclo delas, e
  // estorno (valor negativo) desconta — nunca saem do saldo na hora
  for (const c of compras) {
    if (c.cartao === cartao && c.mesFatura === mes) itens.push({ nome: c.nome, valor: c.valor, origem: "compra" });
  }

  for (const p of parcelas) {
    if (!p.naFatura) continue;
    const doCartao =
      cartao === CARTAO_NAO_INFORMADO ? !p.cartao : p.cartao === cartao;
    if (!doCartao || parcelasRestantesEm(p, mes) <= 0) continue;
    itens.push({ nome: p.nome, valor: p.valorParcela, origem: "parcela" });
  }

  if (cartao !== CARTAO_NAO_INFORMADO) {
    for (const a of assinaturas) {
      if (recorrenciaNoMes(a, mes) && a.naFatura && a.cartao === cartao) {
        itens.push({ nome: a.nome, valor: valorNoMes(a, mes), origem: "assinatura" });
      }
    }
  }

  return {
    cartao,
    total: arredondarCentavos(itens.reduce((acc, i) => acc + i.valor, 0)),
    itens,
  };
}

/**
 * Previsão vale pro mês atual e pra frente. Mês passado vale o que foi
 * lançado (ou o que ficou no fechamento) — não dá pra inventar agora uma
 * fatura que nunca foi registrada. Veja `previsaoAConfirmar` pro caso da
 * previsão cujo vencimento já passou.
 */
export function devePreverFatura(mes: string, hojeISO: string): boolean {
  return mes >= hojeISO.slice(0, 7);
}

/**
 * A previsão venceu e o valor real não foi lançado: não some (seria
 * esconder um compromisso) e também não vira "dívida atrasada" certa —
 * fica como "valor a confirmar" (auditoria F14).
 */
export function previsaoAConfirmar(
  mes: string,
  hojeISO: string,
  diaVencimento?: number
): boolean {
  if (mes !== hojeISO.slice(0, 7) || !diaVencimento) return false;
  return vencimentoEfetivo(diaVencimento, mes).efetivo < hojeISO;
}
