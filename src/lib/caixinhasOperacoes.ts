import { Firestore, doc, increment, runTransaction, serverTimestamp } from "firebase/firestore";

/**
 * Operações de dinheiro das caixinhas, fora do React pra serem testadas no
 * emulador com concorrência de verdade (auditoria 25/10 F03/C23).
 */

export class ErroCaixinha extends Error {}

const centavos = (v: number) => Math.round(v * 100);

/**
 * Corrige o valor de uma caixinha (rendeu, o banco mostra outro número)
 * como DIFERENÇA sobre a base que a pessoa viu: `increment(novo − base)`.
 * Um depósito automático que chegue no meio é preservado — com valor
 * absoluto ele seria apagado. Não mexe no saldo da conta.
 */
export async function ajustarCaixinha(
  db: Firestore,
  uid: string,
  caixinhaId: string,
  baseVista: number,
  novo: number
): Promise<{ base: number; diferenca: number }> {
  const ref = doc(db, "usuarios", uid, "caixinhas", caixinhaId);
  const diferenca = (centavos(novo) - centavos(baseVista)) / 100;
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new ErroCaixinha("Essa caixinha não existe mais.");
    if (diferenca !== 0) tx.update(ref, { saldo: increment(diferenca), atualizadoEm: Date.now() });
    return { base: baseVista, diferenca };
  });
}

/**
 * Guardar (saldo → caixinha) ou resgatar (caixinha → saldo): grava a
 * transferência imutável (id da chave: repetir não duplica) e move o valor
 * na caixinha, na mesma transação. Resgatar mais do que tem é recusado.
 * Devolve false quando a chave já tinha sido gravada (repetição).
 */
export async function transferirCaixinha(
  db: Firestore,
  uid: string,
  caixinhaId: string,
  direcao: "guardar" | "resgatar",
  valor: number,
  chave: string
): Promise<boolean> {
  const c = centavos(valor);
  if (!Number.isFinite(valor) || c <= 0) throw new ErroCaixinha("Informe um valor maior que zero.");
  const refCaixinha = doc(db, "usuarios", uid, "caixinhas", caixinhaId);
  const refTransf = doc(db, "usuarios", uid, "transferencias", `t_${chave}`);
  return runTransaction(db, async (tx) => {
    const [caixa, ja] = await Promise.all([tx.get(refCaixinha), tx.get(refTransf)]);
    if (ja.exists()) return false;
    if (!caixa.exists()) throw new ErroCaixinha("Essa caixinha não existe mais.");
    const saldoAtual = caixa.data().saldo as number;
    if (direcao === "resgatar" && centavos(saldoAtual) < c) {
      throw new ErroCaixinha(
        `A caixinha tem ${saldoAtual.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}: não dá pra resgatar mais do que isso.`
      );
    }
    tx.set(refTransf, {
      caixinhaId,
      nome: caixa.data().nome,
      direcao,
      valor: c / 100,
      criadoEm: Date.now(),
      registradoEm: serverTimestamp(),
    });
    // increment: um depósito automático concorrente não é sobrescrito
    tx.update(refCaixinha, { saldo: increment((direcao === "guardar" ? c : -c) / 100), atualizadoEm: Date.now() });
    return true;
  });
}
