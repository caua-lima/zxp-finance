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
import { Assinatura } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

export function useAssinaturas() {
  const { user } = useAuth();
  const [todas, setTodas] = useState<Assinatura[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "assinaturas"),
      (snap) => {
        setTodas(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Assinatura))
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

  const assinaturas = useMemo(
    () => [...todas].sort((a, b) => b.criadoEm - a.criadoEm),
    [todas]
  );

  async function adicionar(
    nome: string,
    valor: number,
    cartao?: string,
    naFatura?: boolean
  ) {
    if (!user) return;
    try {
      await addDoc(collection(db, "usuarios", user.uid, "assinaturas"), {
        nome,
        valor,
        ativa: true,
        ...(cartao ? { cartao } : {}),
        naFatura: !!naFatura,
        criadoEm: Date.now(),
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function editar(
    id: string,
    dados: {
      nome: string;
      valor: number;
      cartao?: string;
      naFatura?: boolean;
    }
  ) {
    if (!user) return;
    try {
      await updateDoc(doc(db, "usuarios", user.uid, "assinaturas", id), {
        nome: dados.nome,
        valor: dados.valor,
        cartao: dados.cartao || null,
        naFatura: !!dados.naFatura,
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  /**
   * Exclusão definitiva só depois de já arquivada (ativa:false) — o
   * checkbox já é o caminho normal e não destrutivo. Snapshot completo vai
   * pro audit log antes de apagar.
   */
  async function remover(id: string, motivo: string) {
    if (!user) return;
    const assinatura = assinaturas.find((a) => a.id === id);
    if (!assinatura) return;
    if (assinatura.ativa) {
      setErro("Arquive a assinatura antes de excluir definitivamente.");
      return;
    }
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "assinaturas", id);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "assinatura",
        entityId: id,
        summary: `Exclusão definitiva de "${assinatura.nome}": ${motivo}`,
        before: { ...assinatura },
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
    const assinatura = assinaturas.find((a) => a.id === id);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "assinaturas", id);
      batch.update(ref, { ativa });
      if (assinatura) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: ativa ? "updated" : "archived",
          entityType: "assinatura",
          entityId: id,
          summary: ativa
            ? `"${assinatura.nome}" reativada`
            : `"${assinatura.nome}" arquivada`,
          before: { ativa: assinatura.ativa },
          after: { ativa },
        });
      }
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const ativas = assinaturas.filter((a) => a.ativa);
  const total = ativas
    .filter((a) => !a.naFatura)
    .reduce((acc, a) => acc + a.valor, 0);
  const totalNaFatura = ativas
    .filter((a) => a.naFatura)
    .reduce((acc, a) => acc + a.valor, 0);
  const totalGeral = total + totalNaFatura;

  return {
    assinaturas,
    loading,
    erro,
    total,
    totalNaFatura,
    totalGeral,
    adicionar,
    editar,
    remover,
    alternarAtiva,
  };
}
