"use client";

import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  doc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { Caixinha, arredondarCentavos, formatarMoeda } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

/**
 * Caixinhas: potinhos de dinheiro guardado que se enchem sozinhos a cada
 * gasto registrado. O depósito automático em si mora em useGastos — é lá
 * que o gasto é gravado, e as duas coisas precisam acontecer no mesmo
 * batch pra nunca sobrar uma sem a outra. Aqui fica o cadastro e o
 * ajuste manual.
 */
export function useCaixinhas() {
  const { user } = useAuth();
  const [todas, setTodas] = useState<Caixinha[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "caixinhas"),
      (snap) => {
        setTodas(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Caixinha))
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

  const caixinhas = useMemo(
    () => [...todas].sort((a, b) => a.criadoEm - b.criadoEm),
    [todas]
  );

  async function criar(dados: {
    nome: string;
    saldo: number;
    porGasto: number;
    meta?: number;
  }) {
    if (!user) return false;
    try {
      const agora = Date.now();
      await addDoc(collection(db, "usuarios", user.uid, "caixinhas"), {
        nome: dados.nome,
        saldo: arredondarCentavos(dados.saldo),
        porGasto: arredondarCentavos(dados.porGasto),
        // null e não undefined: o Firestore deste projeto rejeita undefined,
        // e null aqui significa "sem meta" de forma explícita
        meta: dados.meta ? arredondarCentavos(dados.meta) : null,
        ativa: true,
        depositos: 0,
        criadoEm: agora,
        atualizadoEm: agora,
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function editar(
    id: string,
    dados: { nome: string; porGasto: number; meta?: number }
  ) {
    if (!user) return false;
    try {
      await updateDoc(doc(db, "usuarios", user.uid, "caixinhas", id), {
        nome: dados.nome,
        porGasto: arredondarCentavos(dados.porGasto),
        meta: dados.meta ? arredondarCentavos(dados.meta) : null,
        atualizadoEm: Date.now(),
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /**
   * Corrige o saldo pra bater com o que realmente está guardado. Vai pro
   * audit log com o valor antigo porque é a única operação que muda o
   * saldo sem ser um depósito — sem registro não daria pra explicar
   * depois por que o número pulou.
   */
  async function ajustarSaldo(id: string, novoSaldo: number) {
    if (!user) return false;
    const caixinha = todas.find((c) => c.id === id);
    if (!caixinha) return false;
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "usuarios", user.uid, "caixinhas", id), {
        saldo: arredondarCentavos(novoSaldo),
        atualizadoEm: Date.now(),
      });
      anexarAuditLog(batch, user.uid, user.email, {
        action: "updated",
        entityType: "caixinha",
        entityId: id,
        summary: `Saldo da caixinha "${caixinha.nome}" corrigido à mão`,
        before: { saldo: caixinha.saldo },
        after: { saldo: arredondarCentavos(novoSaldo) },
      });
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /** Pausa/retoma o depósito automático sem mexer no que já foi guardado. */
  async function alternarAtiva(id: string) {
    if (!user) return false;
    const caixinha = todas.find((c) => c.id === id);
    if (!caixinha) return false;
    try {
      await updateDoc(doc(db, "usuarios", user.uid, "caixinhas", id), {
        ativa: !caixinha.ativa,
        atualizadoEm: Date.now(),
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function remover(id: string) {
    if (!user) return false;
    const caixinha = todas.find((c) => c.id === id);
    if (!caixinha) return false;
    try {
      const batch = writeBatch(db);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "caixinha",
        entityId: id,
        summary: `Caixinha "${caixinha.nome}" excluída com ${formatarMoeda(
          caixinha.saldo
        )} guardado`,
        before: { ...caixinha },
      });
      batch.delete(doc(db, "usuarios", user.uid, "caixinhas", id));
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  return {
    caixinhas,
    loading,
    erro,
    criar,
    editar,
    ajustarSaldo,
    alternarAtiva,
    remover,
  };
}
