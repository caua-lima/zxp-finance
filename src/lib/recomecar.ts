import { Firestore, WriteBatch, doc, writeBatch } from "firebase/firestore";

/**
 * "Recomeçar do zero a partir de hoje": nada é apagado. Num commit só:
 * - o saldo vira o valor que está na conta agora (tudo antes já está dentro dele);
 * - a contagem (relatório, investido do mês) começa hoje;
 * - opcionalmente, as caixinhas voltam a zero.
 * Pra desfazer a contagem, é só apagar a data em "Começar a contar em".
 */
export interface Recomeco {
  /** Valor na conta agora, em reais. */
  saldo: number;
  /** "AAAA-MM-DD" de hoje. */
  hoje: string;
  /** Ids das caixinhas a zerar (vazio = não mexe nelas). */
  zerarCaixinhas: string[];
}

export async function recomecarDoZero(
  db: Firestore,
  uid: string,
  r: Recomeco,
  aoGravar?: (batch: WriteBatch) => void
): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.hoje)) throw new Error("dia inválido");
  if (!Number.isFinite(r.saldo)) throw new Error("saldo inválido");
  const agora = Date.now();
  const batch = writeBatch(db);
  batch.set(
    doc(db, "usuarios", uid, "saldo", "atual"),
    { valor: Math.round(r.saldo * 100) / 100, atualizadoEm: agora },
    { merge: true }
  );
  batch.set(
    doc(db, "usuarios", uid, "preferencias", "app"),
    { inicioUso: r.hoje, inicioHistorico: r.hoje.slice(0, 7) },
    { merge: true }
  );
  for (const id of r.zerarCaixinhas) {
    batch.update(doc(db, "usuarios", uid, "caixinhas", id), { saldo: 0, atualizadoEm: agora });
  }
  aoGravar?.(batch);
  await batch.commit();
}
