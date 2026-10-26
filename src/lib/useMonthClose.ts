"use client";

import { useEffect, useState } from "react";
import { doc, getDoc, onSnapshot, runTransaction, writeBatch } from "firebase/firestore";
import { ResumoFechamento, hashDoResumo } from "./finance/fechamento";
import { db } from "./firebase";
import { MonthClose } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

/**
 * Fechamento de competência (usuarios/{uid}/monthCloses/{mes}), opcional
 * — não bloqueia quem ainda está configurando o app. Mês fechado trava
 * as operações que são claramente "desse mês específico" (marcar
 * pago/recebido no checklist, lançar valor de fatura); o resto do app
 * (editar nome de uma assinatura, por exemplo) não é uma operação de
 * competência então continua liberado mesmo com o mês fechado.
 */
export function useMonthClose(mes: string) {
  const { user } = useAuth();
  const [fechamento, setFechamento] = useState<MonthClose | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, "usuarios", user.uid, "monthCloses", mes),
      (snap) => {
        setFechamento(snap.exists() ? (snap.data() as MonthClose) : null);
        setLoading(false);
        setErro(null);
      },
      (e) => {
        setErro(mensagemErro(e));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user, mes]);

  const fechado = fechamento?.status === "closed";

  /**
   * Fecha o mês gravando uma VERSÃO imutável (totais + linhas + hash) e
   * apontando o documento do mês pra ela, numa transação: fechar de novo
   * depois de reabrir cria a versão seguinte, nunca reescreve a anterior
   * (auditoria 25/10 D30).
   */
  async function fechar(
    snapshot: { income: number; expenses: number; result: number },
    resumo: ResumoFechamento,
    notes?: string
  ) {
    if (!user) return false;
    try {
      const hash = await hashDoResumo(resumo);
      const ref = doc(db, "usuarios", user.uid, "monthCloses", mes);
      await runTransaction(db, async (tx) => {
        const atual = await tx.get(ref);
        const versao = ((atual.exists() ? (atual.data().versao as number | undefined) : 0) ?? 0) + 1;
        tx.set(doc(db, "usuarios", user.uid, "monthCloses", mes, "versoes", String(versao)), {
          versao,
          fechadoEm: Date.now(),
          fechadoPor: user.email ?? user.uid,
          hash,
          resumo,
        });
        tx.set(
          ref,
          {
            month: mes,
            status: "closed",
            closedAt: Date.now(),
            closedBy: user.email ?? user.uid,
            ...(notes ? { notes } : {}),
            snapshot,
            versao,
            hash,
          },
          { merge: true }
        );
        anexarAuditLog(tx, user.uid, user.email, {
          action: "closed_month",
          entityType: "monthClose",
          entityId: mes,
          summary: `Mês ${mes} fechado (versão ${versao})`,
          after: { ...snapshot, versao, hash },
        });
      });
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /** Reabre com motivo; a versão fechada fica intacta e a reabertura vira registro só-acréscimo. */
  async function reabrir(motivo: string) {
    if (!user) return false;
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "monthCloses", mes);
      const versao = fechamento?.versao ?? 0;
      // o motivo fica no próprio documento: as regras do Firestore só
      // aceitam reabrir um mês fechado com motivo (auditoria F11)
      batch.set(ref, { status: "open", reabertoEm: Date.now(), motivoReabertura: motivo }, { merge: true });
      if (versao > 0) {
        batch.set(doc(db, "usuarios", user.uid, "monthCloses", mes, "reaberturas", String(versao)), {
          versao,
          motivo,
          reabertoEm: Date.now(),
          reabertoPor: user.email ?? user.uid,
        });
      }
      anexarAuditLog(batch, user.uid, user.email, {
        action: "updated",
        entityType: "monthClose",
        entityId: mes,
        summary: `Mês ${mes} reaberto${versao ? ` (versão ${versao} fica guardada)` : ""}: ${motivo}`,
      });
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /** O resumo gravado na versão atual (pra comparar com os números vivos). */
  async function resumoFechado(): Promise<ResumoFechamento | null> {
    if (!user || !fechamento?.versao) return null;
    const snap = await getDoc(doc(db, "usuarios", user.uid, "monthCloses", mes, "versoes", String(fechamento.versao)));
    return snap.exists() ? (snap.data().resumo as ResumoFechamento) : null;
  }

  return { fechamento, fechado, loading, erro, fechar, reabrir, resumoFechado };
}
