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
import { ContaFixa } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

export function useContasFixas() {
  const { user } = useAuth();
  const [todas, setTodas] = useState<ContaFixa[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "contasFixas"),
      (snap) => {
        setTodas(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as ContaFixa))
        );
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

  const contas = useMemo(
    () => [...todas].sort((a, b) => b.criadoEm - a.criadoEm),
    [todas]
  );

  async function adicionar(
    nome: string,
    valor: number,
    categoria: string,
    diaVencimento?: number
  ) {
    if (!user) return;
    try {
      await addDoc(collection(db, "usuarios", user.uid, "contasFixas"), {
        nome,
        valor,
        categoria,
        ativa: true,
        ...(diaVencimento ? { diaVencimento } : {}),
        criadoEm: Date.now(),
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function editar(
    id: string,
    dados: { nome: string; valor: number; categoria: string; diaVencimento?: number }
  ) {
    if (!user) return;
    const conta = contas.find((c) => c.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "contasFixas", id);
      batch.update(ref, {
        nome: dados.nome,
        valor: dados.valor,
        categoria: dados.categoria,
        diaVencimento: dados.diaVencimento ?? null,
      });
      if (conta) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: "updated",
          entityType: "contaFixa",
          entityId: id,
          summary: `"${conta.nome}" editada`,
          before: { nome: conta.nome, valor: conta.valor, categoria: conta.categoria, diaVencimento: conta.diaVencimento },
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
   * Exclusão definitiva. Só é permitida depois de já arquivada (ativa:false)
   * — o próprio checkbox "arquivar" é o caminho normal e não destrutivo.
   * O snapshot completo vai pro audit log antes de apagar, então o dado
   * sobrevive na trilha de auditoria mesmo depois do documento sumir.
   */
  async function remover(id: string, motivo: string) {
    if (!user) return;
    const conta = contas.find((c) => c.id === id);
    if (!conta) return;
    if (conta.ativa) {
      setErro("Arquive a conta antes de excluir definitivamente.");
      return;
    }
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "contasFixas", id);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "contaFixa",
        entityId: id,
        summary: `Exclusão definitiva de "${conta.nome}": ${motivo}`,
        before: { ...conta },
      });
      batch.delete(ref);
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function alternarAtiva(id: string, ativa: boolean) {
    if (!user) return;
    const conta = contas.find((c) => c.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "contasFixas", id);
      batch.update(ref, { ativa });
      if (conta) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: ativa ? "updated" : "archived",
          entityType: "contaFixa",
          entityId: id,
          summary: ativa
            ? `"${conta.nome}" reativada`
            : `"${conta.nome}" arquivada`,
          before: { ativa: conta.ativa },
          after: { ativa },
        });
      }
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const total = contas
    .filter((c) => c.ativa)
    .reduce((acc, c) => acc + c.valor, 0);

  return {
    contas,
    loading,
    erro,
    total,
    adicionar,
    editar,
    remover,
    alternarAtiva,
  };
}
