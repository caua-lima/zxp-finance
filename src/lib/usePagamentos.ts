"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, doc, setDoc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";

/**
 * Guarda o que já foi pago em cada mês. O id de cada documento é
 * "<mes>__<origem>__<idDoItem>", então marcar/desmarcar é sempre uma
 * operação direta, sem precisar procurar nada antes.
 */
export type OrigemItem = "conta" | "assinatura" | "parcela" | "fatura" | "ganho";

function chave(mes: string, origem: OrigemItem, itemId: string) {
  return `${mes}__${origem}__${itemId}`;
}

export function usePagamentos(mes: string) {
  const { user } = useAuth();
  const [pagos, setPagos] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "pagamentos"),
      (snap) => {
        setPagos(new Set(snap.docs.map((d) => d.id)));
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

  const estaPago = useMemo(
    () => (origem: OrigemItem, itemId: string) =>
      pagos.has(chave(mes, origem, itemId)),
    [pagos, mes]
  );

  async function marcar(
    origem: OrigemItem,
    itemId: string,
    pago: boolean,
    dados: { nome: string; valor: number }
  ) {
    if (!user) return;
    const id = chave(mes, origem, itemId);
    const ref = doc(db, "usuarios", user.uid, "pagamentos", id);
    try {
      if (pago) {
        await setDoc(ref, {
          mes,
          origem,
          itemId,
          nome: dados.nome,
          valor: dados.valor,
          pagoEm: Date.now(),
        });
      } else {
        await deleteDoc(ref);
      }
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { loading, erro, estaPago, marcar };
}
