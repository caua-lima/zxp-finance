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
import {
  Parcela,
  TipoParcela,
  VinculoDesejo,
  mesPadrao,
  parcelasRestantesEm,
  valorMinhaParte,
} from "./types";
import { baixaDasParcelasDaFatura, marcarParcelaPaga } from "./parcelasOperacoes";
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

  /**
   * `vinculoDesejo`, quando presente, é gravado como uma CÓPIA do item do
   * Tasks no momento da criação — não uma referência viva. É o que faz
   * "decidi financiar isso baseado em R$ 1.200" continuar verdadeiro
   * mesmo que o preço do item mude depois lá.
   */
  async function adicionar(
    nome: string,
    valorParcela: number,
    totalParcelas: number,
    parcelasRestantes: number,
    tipo: TipoParcela,
    dividida?: boolean,
    naFatura?: boolean,
    cartao?: string,
    mesReferencia?: string,
    vinculoDesejo?: VinculoDesejo
  ) {
    if (!user) return false;
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
        ...(vinculoDesejo ? { vinculoDesejo } : {}),
        criadoEm: Date.now(),
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
    if (!user) return false;
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
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /**
   * Exclusão definitiva (a pessoa quer recomeçar o cadastro). O retrato
   * completo vai pra trilha de auditoria antes de apagar.
   */
  async function remover(id: string, motivo = "") {
    if (!user) return false;
    const parcela = parcelas.find((p) => p.id === id);
    if (!parcela) return false;
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "parcelas", id);
      anexarAuditLog(batch, user.uid, user.email, {
        action: "archived",
        entityType: "parcela",
        entityId: id,
        summary: `Parcela "${parcela.nome}" excluída${motivo ? `: ${motivo}` : ""}`,
        before: { ...parcela },
      });
      batch.delete(ref);
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /**
   * Marca a parcela do mês como paga (ou desfaz). É a MESMA operação do
   * "A pagar": as duas telas mostram sempre o mesmo.
   */
  async function marcarPaga(id: string, mes: string, pago: boolean) {
    if (!user) return false;
    const p = parcelas.find((x) => x.id === id);
    if (!p) return false;
    try {
      await marcarParcelaPaga(db, user.uid, id, mes, pago, valorMinhaParte(p));
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  /** Pagar/desmarcar a fatura de um cartão dá/desfaz baixa nas parcelas dentro dela. */
  async function baixaPelaFatura(cartao: string, mes: string, pago: boolean) {
    if (!user) return false;
    const ids = parcelas
      .filter((p) => p.naFatura && p.cartao === cartao && parcelasRestantesEm(p, mes) > 0)
      .map((p) => p.id);
    try {
      await baixaDasParcelasDaFatura(db, user.uid, ids, mes, pago);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
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
    marcarPaga,
    baixaPelaFatura,
  };
}
