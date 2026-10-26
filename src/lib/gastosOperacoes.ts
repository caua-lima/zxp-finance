import { Firestore, Transaction, doc, increment, runTransaction, serverTimestamp } from "firebase/firestore";
import type { Gasto } from "./types";

/**
 * Operações de gasto que precisam ser seguras sob concorrência e respeitar
 * a história fechada, fora do React pra serem testadas no emulador
 * (auditoria 25/10 F04/F05/D25/D26).
 */

export const idDoEstorno = (gastoId: string) => `estorno__${gastoId}`;

const inverter = (d: Record<string, number>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, -v]));

export type ResultadoEstorno = "ok" | "ja" | "sumiu";

/**
 * Estorno é um lançamento NOVO no mês atual, ligado ao original
 * (`estornoDeId`), com id fixo (`estorno__<id>`): estornar duas vezes —
 * duas abas, retry — produz um só. O original NÃO é editado: assim dá pra
 * estornar hoje um gasto de mês já fechado sem mexer na história fechada
 * (antes falhava, porque marcar o original batia na regra de mês fechado).
 * "Estornado" passa a ser derivado da existência do estorno.
 */
export async function estornarGasto(
  db: Firestore,
  uid: string,
  gastoId: string,
  hojeISO: string,
  caixinhasExistentes: Set<string>,
  /** Pra trilha de auditoria entrar na MESMA transação. */
  aoGravar?: (tx: Transaction, original: Gasto) => void
): Promise<ResultadoEstorno> {
  const refOriginal = doc(db, "usuarios", uid, "gastos", gastoId);
  const refEstorno = doc(db, "usuarios", uid, "gastos", idDoEstorno(gastoId));
  return runTransaction(db, async (tx) => {
    const [snap, ja] = await Promise.all([tx.get(refOriginal), tx.get(refEstorno)]);
    if (!snap.exists()) return "sumiu";
    const original = { id: gastoId, ...snap.data() } as Gasto;
    if (original.estornado || original.estornoDeId || ja.exists()) return "ja";

    tx.set(refEstorno, {
      descricao: `Estorno: ${original.descricao}`,
      valor: -original.valor,
      categoria: original.categoria,
      data: hojeISO,
      mes: hojeISO.slice(0, 7),
      criadoEm: Date.now(),
      registradoEm: serverTimestamp(),
      estornoDeId: gastoId,
      ...(original.guardado ? { guardado: inverter(original.guardado) } : {}),
      // estorno de compra no crédito também não mexe no saldo
      ...(original.pagoCom === "credito"
        ? { pagoCom: "credito", ...(original.cartao ? { cartao: original.cartao } : {}) }
        : {}),
    });
    // o que foi pras caixinhas volta, só nas que ainda existem
    for (const [caixinhaId, valor] of Object.entries(inverter(original.guardado ?? {}))) {
      if (!caixinhasExistentes.has(caixinhaId)) continue;
      tx.update(doc(db, "usuarios", uid, "caixinhas", caixinhaId), {
        saldo: increment(valor),
        depositos: increment(-1),
        atualizadoEm: Date.now(),
      });
    }
    aoGravar?.(tx, original);
    return "ok";
  });
}

/**
 * "Estornado" derivado: o original conta como estornado se ele mesmo diz
 * (dado antigo) OU se existe o lançamento de estorno dele.
 */
export function comEstornoDerivado(gastos: Gasto[]): Gasto[] {
  const estornados = new Set(gastos.filter((g) => g.estornoDeId).map((g) => g.estornoDeId as string));
  return gastos.map((g) => (!g.estornado && estornados.has(g.id) ? { ...g, estornado: true } : g));
}
