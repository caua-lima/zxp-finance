"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, doc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { Comissao, formatarMoeda } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";
import { calcularComissaoDoDia, ContagemComissao, ValoresComissao } from "./finance/comissoes";

/**
 * Lançamento diário de comissão (usuarios/{uid}/comissoes/{data}) — um
 * documento por dia (a própria data é o id), então registrar de novo no
 * mesmo dia sempre corrige o lançamento em vez de duplicar. O valor é
 * calculado e gravado no momento do registro, com os valores vigentes
 * então — não recalcula sozinho se a configuração de valores mudar depois,
 * pra não reescrever retroativamente o que já foi ganho com valores antigos.
 */
export function useComissoes(mes: string) {
  const { user } = useAuth();
  const [todas, setTodas] = useState<Comissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "comissoes"),
      (snap) => {
        setTodas(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Comissao)));
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

  const doMes = useMemo(
    () =>
      todas
        .filter((c) => c.mes === mes)
        .sort((a, b) => b.data.localeCompare(a.data)),
    [todas, mes]
  );

  const totalMes = doMes.reduce((acc, c) => acc + c.valorTotal, 0);
  const totalReunioes = doMes.reduce((acc, c) => acc + c.reunioes, 0);
  const totalVendasPerformance = doMes.reduce((acc, c) => acc + c.vendasPerformance, 0);
  const totalVendasAcelera = doMes.reduce((acc, c) => acc + c.vendasAcelera, 0);

  async function registrar(data: string, contagem: ContagemComissao, valores: ValoresComissao) {
    if (!user) return;
    const existente = todas.find((c) => c.id === data);
    const valorTotal = calcularComissaoDoDia(contagem, valores);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "comissoes", data);
      batch.set(ref, {
        data,
        mes: data.slice(0, 7),
        ...contagem,
        valorTotal,
        criadoEm: existente?.criadoEm ?? Date.now(),
        atualizadoEm: Date.now(),
      });
      anexarAuditLog(batch, user.uid, user.email, {
        action: existente ? "updated" : "created",
        entityType: "comissao",
        entityId: data,
        summary: `Comissão de ${data}: ${contagem.reunioes} reunião(ões), ${contagem.vendasPerformance} venda(s) performance, ${contagem.vendasAcelera} venda(s) acelera — ${formatarMoeda(valorTotal)}`,
        before: existente ? { ...existente } : undefined,
        after: { ...contagem, valorTotal },
      });
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function remover(data: string) {
    if (!user) return;
    const existente = todas.find((c) => c.id === data);
    if (!existente) return;
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "comissoes", data);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "comissao",
        entityId: data,
        summary: `Comissão de ${data} excluída (era ${formatarMoeda(existente.valorTotal)})`,
        before: { ...existente },
      });
      batch.delete(ref);
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return {
    doMes,
    loading,
    erro,
    totalMes,
    totalReunioes,
    totalVendasPerformance,
    totalVendasAcelera,
    registrar,
    remover,
  };
}
