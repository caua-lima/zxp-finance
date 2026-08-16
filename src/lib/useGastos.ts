"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Gasto, mesPadrao } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

export function useGastos() {
  const { user } = useAuth();
  const [todos, setTodos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "gastos"),
      (snap) => {
        setTodos(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Gasto)));
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

  const gastos = useMemo(
    () => [...todos].sort((a, b) => b.criadoEm - a.criadoEm),
    [todos]
  );

  async function adicionar(descricao: string, valor: number, categoria: string) {
    if (!user) return;
    try {
      await addDoc(collection(db, "usuarios", user.uid, "gastos"), {
        descricao,
        valor,
        categoria,
        mes: mesPadrao(),
        criadoEm: Date.now(),
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function editar(
    id: string,
    dados: { descricao: string; valor: number; categoria: string }
  ) {
    if (!user) return;
    try {
      await updateDoc(doc(db, "usuarios", user.uid, "gastos", id), dados);
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  /**
   * Gasto já é dinheiro que saiu de verdade — não apaga, estorna: mantém o
   * lançamento original (marcado `estornado`) e cria uma contrapartida
   * negativa rastreável, que é o que efetivamente devolve o valor pro
   * saldo. Bloqueia estornar duas vezes o mesmo gasto.
   */
  async function estornar(id: string, motivo: string) {
    if (!user) return;
    const original = todos.find((g) => g.id === id);
    if (!original || original.estornado || original.estornoDeId) return;
    try {
      const batch = writeBatch(db);
      const refOriginal = doc(db, "usuarios", user.uid, "gastos", id);
      batch.update(refOriginal, {
        estornado: true,
        estornadoEm: Date.now(),
      });
      const refEstorno = doc(collection(db, "usuarios", user.uid, "gastos"));
      batch.set(refEstorno, {
        descricao: `Estorno: ${original.descricao}`,
        valor: -original.valor,
        categoria: original.categoria,
        mes: mesPadrao(),
        criadoEm: Date.now(),
        estornoDeId: id,
      });
      anexarAuditLog(batch, user.uid, user.email, {
        action: "reversed",
        entityType: "gasto",
        entityId: id,
        summary: `Estorno de "${original.descricao}": ${motivo}`,
        before: { valor: original.valor, categoria: original.categoria },
        after: { motivo },
      });
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  /**
   * Exclusão definitiva — diferente de estornar, aqui o lançamento some
   * de verdade. Só disponível pra gasto "normal" (nunca foi estornado e
   * não é ele mesmo um estorno): apagar metade de um par estorno/original
   * deixaria a outra metade contando sozinha, adicionando ou tirando
   * dinheiro do saldo sem explicação nenhuma. Snapshot completo vai pro
   * audit log antes de apagar, então o dado sobrevive na trilha de
   * auditoria mesmo depois do documento sumir.
   */
  async function remover(id: string, motivo: string) {
    if (!user) return;
    const gasto = todos.find((g) => g.id === id);
    if (!gasto) return;
    if (gasto.estornado || gasto.estornoDeId) {
      setErro("Esse lançamento faz parte de um estorno e não pode ser excluído direto.");
      return;
    }
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "gastos", id);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "gasto",
        entityId: id,
        summary: `Exclusão definitiva de "${gasto.descricao}": ${motivo}`,
        before: { ...gasto },
      });
      batch.delete(ref);
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { gastos, loading, erro, adicionar, editar, estornar, remover };
}
