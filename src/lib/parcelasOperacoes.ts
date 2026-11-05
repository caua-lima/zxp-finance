import { Firestore, doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { diferencaMeses, mesAnteriorDe, mesPadrao, mesSeguinte, Parcela } from "./types";

/**
 * Baixa de parcela com uma fonte só de verdade (antes, "A pagar" e a tela
 * de Parcelas guardavam o pago cada um do seu jeito e mostravam números
 * diferentes).
 *
 * `mesReferencia` = mês da PRÓXIMA parcela a pagar; `parcelasRestantes` =
 * quantas faltam a partir dela. Pagar o mês M deixa a parcela "em dia até
 * M": a próxima passa a ser M+1. Desfazer volta exatamente um mês.
 * A agenda (que parcela cai em cada mês) não muda com a baixa — ver
 * parcelasRestantesEm.
 */

type Estado = Pick<Parcela, "parcelasRestantes" | "totalParcelas" | "mesReferencia">;

/** Estado depois de pagar o mês `mes`, ou null se esse mês já estava pago. */
export function baixaAte(p: Estado, mes: string): { parcelasRestantes: number; mesReferencia: string } | null {
  const ref = p.mesReferencia ?? mesPadrao();
  if (ref > mes || p.parcelasRestantes <= 0) return null;
  const pagando = diferencaMeses(ref, mes) + 1;
  return { parcelasRestantes: Math.max(0, p.parcelasRestantes - pagando), mesReferencia: mesSeguinte(mes) };
}

/** Estado depois de desfazer o pagamento do mês `mes`, ou null se não foi esse o último mês pago. */
export function desfazerBaixa(p: Estado, mes: string): { parcelasRestantes: number; mesReferencia: string } | null {
  const ref = p.mesReferencia ?? mesPadrao();
  if (ref !== mesSeguinte(mes) || p.parcelasRestantes >= p.totalParcelas) return null;
  return { parcelasRestantes: p.parcelasRestantes + 1, mesReferencia: mesAnteriorDe(ref) };
}

export const idPagamentoParcela = (mes: string, parcelaId: string) => `${mes}__parcela__${parcelaId}`;

/**
 * Marca (ou desmarca) a parcela do mês como paga, numa transação:
 * - parcela fora da fatura (carro, boleto): grava o pagamento do "A pagar"
 *   (sai do saldo uma vez) e dá baixa na parcela;
 * - parcela dentro da fatura do cartão: só dá baixa — o dinheiro sai
 *   quando a fatura é paga.
 * Marcar de novo o que já está marcado não muda nada.
 */
export async function marcarParcelaPaga(
  db: Firestore,
  uid: string,
  parcelaId: string,
  mes: string,
  pago: boolean,
  valor: number
): Promise<void> {
  const refParcela = doc(db, "usuarios", uid, "parcelas", parcelaId);
  const refPag = doc(db, "usuarios", uid, "pagamentos", idPagamentoParcela(mes, parcelaId));
  await runTransaction(db, async (tx) => {
    const [snapP, snapPag] = await Promise.all([tx.get(refParcela), tx.get(refPag)]);
    if (!snapP.exists()) return;
    const p = snapP.data() as Parcela;
    const registraPagamento = !p.naFatura;
    if (pago) {
      const novo = baixaAte(p, mes);
      if (novo) tx.update(refParcela, novo);
      if (registraPagamento && !snapPag.exists()) {
        tx.set(refPag, {
          mes,
          origem: "parcela",
          itemId: parcelaId,
          nome: p.nome,
          valor,
          pagoEm: Date.now(),
          registradoEm: serverTimestamp(),
          afetaSaldo: true,
        });
      }
    } else {
      const novo = desfazerBaixa(p, mes);
      if (novo) tx.update(refParcela, novo);
      if (snapPag.exists()) tx.delete(refPag);
    }
  });
}

/**
 * Pagar a fatura de um cartão dá baixa nas parcelas que estão dentro dela
 * (mesmo cartão, "já na fatura"). Desmarcar a fatura desfaz.
 */
export async function baixaDasParcelasDaFatura(
  db: Firestore,
  uid: string,
  parcelaIds: string[],
  mes: string,
  pago: boolean
): Promise<void> {
  if (parcelaIds.length === 0) return;
  await runTransaction(db, async (tx) => {
    const refs = parcelaIds.map((id) => doc(db, "usuarios", uid, "parcelas", id));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    snaps.forEach((s, i) => {
      if (!s.exists()) return;
      const p = s.data() as Parcela;
      const novo = pago ? baixaAte(p, mes) : desfazerBaixa(p, mes);
      if (novo) tx.update(refs[i], novo);
    });
  });
}
