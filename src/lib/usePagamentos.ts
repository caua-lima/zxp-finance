"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  doc,
  deleteDoc,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { MovimentoPagamento } from "./finance/saldo";

/**
 * Guarda o que já foi pago em cada mês. O id de cada documento é
 * "<mes>__<origem>__<idDoItem>", então marcar/desmarcar é sempre uma
 * operação direta, sem precisar procurar nada antes.
 *
 * Marcar como pago é também um MOVIMENTO de caixa (auditoria F03): o
 * documento guarda valor e quando foi pago (`pagoEm`), e o saldo
 * confirmado desconta pagamentos feitos depois da última atualização de
 * saldo — uma vez só, porque o id é fixo. Ver docs/modelo-financeiro.md.
 */
export type OrigemItem = "conta" | "assinatura" | "parcela" | "fatura" | "ganho";

interface DocPagamento extends MovimentoPagamento {
  id: string;
  mes: string;
  itemId: string;
}

function chave(mes: string, origem: OrigemItem, itemId: string) {
  return `${mes}__${origem}__${itemId}`;
}

export function usePagamentos(mes: string) {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DocPagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "pagamentos"),
      (snap) => {
        setDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as DocPagamento)));
        setLoading(false);
        setErro(null);
      },
      (e) => {
        setErro(mensagemErro(e));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  const porId = useMemo(() => new Map(docs.map((d) => [d.id, d])), [docs]);

  const estaPago = useMemo(
    () => (origem: OrigemItem, itemId: string) => porId.has(chave(mes, origem, itemId)),
    [porId, mes]
  );

  /** Quando foi pago de verdade (timestamp) — a data do fluxo de caixa realizado. */
  const dataPagamento = useMemo(
    () => (origem: OrigemItem, itemId: string) => porId.get(chave(mes, origem, itemId))?.pagoEm,
    [porId, mes]
  );

  /** Todos os pagamentos, de todos os meses, como movimentos de caixa. */
  const movimentos: MovimentoPagamento[] = docs;

  async function marcar(
    origem: OrigemItem,
    itemId: string,
    pago: boolean,
    dados: { nome: string; valor: number }
  ) {
    if (!user) return false;
    const id = chave(mes, origem, itemId);
    const ref = doc(db, "usuarios", user.uid, "pagamentos", id);
    try {
      if (pago) {
        // transação: marcar duas vezes (duas abas, clique duplo) não
        // regrava o pagoEm nem cria um segundo movimento
        await runTransaction(db, async (tx) => {
          if ((await tx.get(ref)).exists()) return;
          tx.set(ref, {
            mes,
            origem,
            itemId,
            nome: dados.nome,
            valor: dados.valor,
            pagoEm: Date.now(),
            registradoEm: serverTimestamp(),
            afetaSaldo: origem !== "ganho",
          });
        });
      } else {
        await deleteDoc(ref);
      }
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  return { loading, erro, estaPago, dataPagamento, movimentos, marcar };
}
