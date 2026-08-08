"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { Conciliacao, formatarMoeda, mesPadrao } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

/**
 * Histórico de conferências de saldo (usuarios/{uid}/conciliacoes).
 * Guarda o que o sistema esperava vs. o que o usuário informou de
 * verdade, e se isso virou um ajuste — nunca move o saldo de referência
 * sem deixar esse rastro junto.
 */
export function useConciliacoes() {
  const { user } = useAuth();
  const [todas, setTodas] = useState<Conciliacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "conciliacoes"),
      (snap) => {
        setTodas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Conciliacao)));
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

  const historico = useMemo(
    () => [...todas].sort((a, b) => b.criadoEm - a.criadoEm),
    [todas]
  );

  /**
   * Registra uma conferência. Sem diferença: só confirma e rola a
   * referência de saldo pra agora. Com diferença e `criarAjuste`: cria um
   * gasto de ajuste rastreável (categoria "Ajuste"), rola a referência e
   * loga tudo no mesmo batch. Com diferença e `criarAjuste: false`
   * ("adiar"): só fica registrado no histórico, nada mais muda — o saldo
   * de referência nunca é alterado silenciosamente.
   */
  async function registrar(params: {
    saldoInformado: number;
    saldoEsperado: number;
    criarAjuste: boolean;
    descricaoAjuste?: string;
  }) {
    if (!user) return;
    const diferenca = params.saldoInformado - params.saldoEsperado;
    const ajusteCriado = params.criarAjuste && diferenca !== 0;

    try {
      const batch = writeBatch(db);
      const refConciliacao = doc(collection(db, "usuarios", user.uid, "conciliacoes"));

      batch.set(refConciliacao, {
        dataISO: new Date().toISOString().slice(0, 10),
        saldoInformado: params.saldoInformado,
        saldoEsperado: params.saldoEsperado,
        diferenca,
        ajusteCriado,
        responsavelUid: user.uid,
        ...(user.email ? { responsavelEmail: user.email } : {}),
        criadoEm: Date.now(),
      });

      if (ajusteCriado) {
        const refGasto = doc(collection(db, "usuarios", user.uid, "gastos"));
        const valorAjuste = params.saldoEsperado - params.saldoInformado;
        batch.set(refGasto, {
          descricao: `Ajuste de conciliação: ${params.descricaoAjuste}`,
          valor: valorAjuste,
          categoria: "Ajuste",
          mes: mesPadrao(),
          criadoEm: Date.now(),
          ajusteConciliacaoId: refConciliacao.id,
        });
        const refSaldo = doc(db, "usuarios", user.uid, "saldo", "atual");
        batch.set(refSaldo, { valor: params.saldoInformado, atualizadoEm: Date.now() });
        anexarAuditLog(batch, user.uid, user.email, {
          action: "reconciled",
          entityType: "saldo",
          entityId: "atual",
          summary: `Conciliação com ajuste de ${formatarMoeda(Math.abs(diferenca))}: ${params.descricaoAjuste}`,
          before: { saldoEsperado: params.saldoEsperado },
          after: { saldoInformado: params.saldoInformado, diferenca },
        });
      } else if (diferenca === 0) {
        const refSaldo = doc(db, "usuarios", user.uid, "saldo", "atual");
        batch.set(refSaldo, { valor: params.saldoInformado, atualizadoEm: Date.now() });
        anexarAuditLog(batch, user.uid, user.email, {
          action: "reconciled",
          entityType: "saldo",
          entityId: "atual",
          summary: "Conciliação sem diferença",
          after: { saldoInformado: params.saldoInformado },
        });
      }
      // diferença !== 0 e criarAjuste === false ("adiar"): só o histórico acima é gravado

      await batch.commit();
      setErro(null);
      return { diferenca, ajusteCriado };
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { historico, loading, erro, registrar };
}
