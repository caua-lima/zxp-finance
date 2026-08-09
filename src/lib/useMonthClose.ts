"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, writeBatch } from "firebase/firestore";
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

  async function fechar(snapshot: { income: number; expenses: number; result: number }, notes?: string) {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "monthCloses", mes);
      batch.set(ref, {
        month: mes,
        status: "closed",
        closedAt: Date.now(),
        closedBy: user.email ?? user.uid,
        ...(notes ? { notes } : {}),
        snapshot,
      });
      anexarAuditLog(batch, user.uid, user.email, {
        action: "closed_month",
        entityType: "monthClose",
        entityId: mes,
        summary: `Mês ${mes} fechado`,
        after: snapshot,
      });
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function reabrir(motivo: string) {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "monthCloses", mes);
      batch.set(ref, { status: "open" }, { merge: true });
      anexarAuditLog(batch, user.uid, user.email, {
        action: "updated",
        entityType: "monthClose",
        entityId: mes,
        summary: `Mês ${mes} reaberto: ${motivo}`,
      });
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { fechamento, fechado, loading, erro, fechar, reabrir };
}
