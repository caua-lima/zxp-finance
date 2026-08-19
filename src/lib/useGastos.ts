"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  doc,
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
    const gasto = todos.find((g) => g.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "gastos", id);
      batch.update(ref, dados);
      if (gasto) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: "updated",
          entityType: "gasto",
          entityId: id,
          summary: `"${gasto.descricao}" editado`,
          before: { descricao: gasto.descricao, valor: gasto.valor, categoria: gasto.categoria },
          after: dados,
        });
      }
      await batch.commit();
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
   * Exclusão definitiva — diferente de estornar, aqui o(s) lançamento(s)
   * somem de verdade. Gasto normal: apaga só ele. Gasto que faz parte de
   * um par estorno/original (qualquer uma das duas metades): apaga as
   * DUAS juntas no mesmo batch — nunca só uma, porque apagar metade
   * deixaria a outra contando sozinha e mudando o saldo sem explicação.
   * Apagar o par inteiro é seguro porque as duas metades já se cancelam
   * (soma zero), então remover as duas não move o saldo nenhum pouco.
   * Snapshot completo (dos dois lados, quando houver) vai pro audit log
   * antes de apagar.
   */
  async function remover(id: string, motivo: string) {
    if (!user) return;
    const gasto = todos.find((g) => g.id === id);
    if (!gasto) return;

    const idOriginal = gasto.estornoDeId ?? gasto.id;
    const original = todos.find((g) => g.id === idOriginal);
    const estorno = todos.find((g) => g.estornoDeId === idOriginal);
    if (!original) return;

    try {
      const batch = writeBatch(db);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "gasto",
        entityId: original.id,
        summary: estorno
          ? `Exclusão definitiva do par estorno/original de "${original.descricao}": ${motivo}`
          : `Exclusão definitiva de "${original.descricao}": ${motivo}`,
        before: estorno ? { original, estorno } : { ...original },
      });
      batch.delete(doc(db, "usuarios", user.uid, "gastos", original.id));
      if (estorno) {
        batch.delete(doc(db, "usuarios", user.uid, "gastos", estorno.id));
      }
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { gastos, loading, erro, adicionar, editar, estornar, remover };
}
