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
import { Parcela, TipoParcela, mesPadrao, mesSeguinte, mesAnteriorDe, valorMinhaParte } from "./types";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

export function useParcelas() {
  const { user } = useAuth();
  const [todas, setTodas] = useState<Parcela[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "parcelas"),
      (snap) => {
        setTodas(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as Parcela))
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

  const parcelas = useMemo(
    () => [...todas].sort((a, b) => b.criadoEm - a.criadoEm),
    [todas]
  );

  async function adicionar(
    nome: string,
    valorParcela: number,
    totalParcelas: number,
    parcelasRestantes: number,
    tipo: TipoParcela,
    dividida?: boolean,
    naFatura?: boolean,
    cartao?: string,
    mesReferencia?: string
  ) {
    if (!user) return;
    try {
      await addDoc(collection(db, "usuarios", user.uid, "parcelas"), {
        tipo,
        nome,
        valorParcela,
        totalParcelas,
        parcelasRestantes,
        dividida: !!dividida,
        naFatura: tipo === "cartao" ? !!naFatura : false,
        ...(tipo === "cartao" && cartao ? { cartao } : {}),
        mesReferencia: mesReferencia ?? mesPadrao(),
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
      valorParcela: number;
      totalParcelas: number;
      parcelasRestantes: number;
      tipo: TipoParcela;
      dividida?: boolean;
      naFatura?: boolean;
      cartao?: string;
      mesReferencia?: string;
    }
  ) {
    if (!user) return;
    const parcela = parcelas.find((p) => p.id === id);
    try {
      const { cartao, mesReferencia, ...resto } = dados;
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "parcelas", id);
      const dadosGravados = {
        ...resto,
        dividida: !!dados.dividida,
        naFatura: dados.tipo === "cartao" ? !!dados.naFatura : false,
        cartao: dados.tipo === "cartao" && cartao ? cartao : null,
        mesReferencia: mesReferencia ?? mesPadrao(),
      };
      batch.update(ref, dadosGravados);
      if (parcela) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: "updated",
          entityType: "parcela",
          entityId: id,
          summary: `"${parcela.nome}" editada`,
          before: {
            nome: parcela.nome,
            valorParcela: parcela.valorParcela,
            totalParcelas: parcela.totalParcelas,
            parcelasRestantes: parcela.parcelasRestantes,
            tipo: parcela.tipo,
            dividida: parcela.dividida,
            naFatura: parcela.naFatura,
            cartao: parcela.cartao,
            mesReferencia: parcela.mesReferencia,
          },
          after: dadosGravados,
        });
      }
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  /**
   * Parcela ativa nunca pode ser excluída direto — regra explícita do
   * briefing, porque apagar uma parcela em andamento derruba o
   * compromisso mensal sem deixar rastro. Só dá pra excluir depois de
   * quitada (parcelasRestantes === 0), e mesmo assim com motivo e
   * snapshot completo gravado em audit log antes do delete.
   */
  async function remover(id: string, motivo: string) {
    if (!user) return;
    const parcela = parcelas.find((p) => p.id === id);
    if (!parcela) return;
    if (parcela.parcelasRestantes > 0) {
      setErro("Parcela ativa não pode ser excluída — espere ela ficar quitada.");
      return;
    }
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "parcelas", id);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "parcela",
        entityId: id,
        summary: `Exclusão definitiva de "${parcela.nome}" (quitada): ${motivo}`,
        before: { ...parcela },
      });
      batch.delete(ref);
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function darBaixa(id: string) {
    if (!user) return;
    const p = parcelas.find((x) => x.id === id);
    if (!p) return;
    const novoValor = Math.max(0, p.parcelasRestantes - 1);
    // Avança a partir da própria referência da parcela, não do mês real de
    // hoje — assim pagar em dia ou colocar em dia várias parcelas atrasadas
    // de uma vez sempre aponta a próxima pro mês seguinte certo.
    const novaReferencia = mesSeguinte(p.mesReferencia ?? mesPadrao());
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "parcelas", id);
      batch.update(ref, { parcelasRestantes: novoValor, mesReferencia: novaReferencia });
      anexarAuditLog(batch, user.uid, user.email, {
        action: "paid",
        entityType: "parcela",
        entityId: id,
        summary: `Baixa em "${p.nome}"`,
        before: { parcelasRestantes: p.parcelasRestantes },
        after: { parcelasRestantes: novoValor },
      });
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function reverterBaixa(id: string) {
    if (!user) return;
    const p = parcelas.find((x) => x.id === id);
    if (!p) return;
    const novoValor = Math.min(p.totalParcelas, p.parcelasRestantes + 1);
    const novaReferencia = mesAnteriorDe(p.mesReferencia ?? mesPadrao());
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "parcelas", id);
      batch.update(ref, { parcelasRestantes: novoValor, mesReferencia: novaReferencia });
      anexarAuditLog(batch, user.uid, user.email, {
        action: "reversed",
        entityType: "parcela",
        entityId: id,
        summary: `Baixa revertida em "${p.nome}"`,
        before: { parcelasRestantes: p.parcelasRestantes },
        after: { parcelasRestantes: novoValor },
      });
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const ativas = parcelas.filter((p) => p.parcelasRestantes > 0);
  const total = ativas
    .filter((p) => !p.naFatura)
    .reduce((acc, p) => acc + valorMinhaParte(p), 0);

  return {
    parcelas,
    ativas,
    loading,
    erro,
    total,
    adicionar,
    editar,
    remover,
    darBaixa,
    reverterBaixa,
  };
}
