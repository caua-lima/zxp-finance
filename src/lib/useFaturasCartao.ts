"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, doc, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { FaturaCartao, formatarMoeda } from "./types";
import { CARTOES_PREDEFINIDOS } from "./cartoes";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";

function chave(mes: string, cartao: string) {
  return `${mes}__${cartao}`;
}

/**
 * Sempre retorna os 6 cartões pré-definidos pro mês, zerados quando
 * ainda não foi lançado nada. Salvar é sempre um upsert por
 * mes+cartão, não existe "adicionar" nem "excluir".
 */
export function useFaturasCartao(mes: string) {
  const { user } = useAuth();
  const [todas, setTodas] = useState<FaturaCartao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "faturasCartao"),
      (snap) => {
        setTodas(
          snap.docs.map((d) => ({ id: d.id, ...d.data() } as FaturaCartao))
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

  const faturas = useMemo(() => {
    return CARTOES_PREDEFINIDOS.map((cartao) => {
      const existente = todas.find((f) => f.mes === mes && f.nome === cartao);
      return (
        existente ?? {
          id: chave(mes, cartao),
          nome: cartao,
          valor: 0,
          mes,
          criadoEm: 0,
        }
      );
    });
  }, [todas, mes]);

  async function salvar(cartao: string, valor: number) {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "usuarios", user.uid, "faturasCartao", chave(mes, cartao)),
        { nome: cartao, valor, mes, criadoEm: Date.now() }
      );
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  /**
   * "Excluir" aqui é voltar a fatura pro estado "não lançada" — apaga o
   * documento em vez de zerar o valor, pra ficar indistinguível de nunca
   * ter lançado nada (mesma regra que já existe: ausência de doc = 0,
   * zerado). Loga o valor anterior se havia algo lançado de verdade.
   */
  async function excluir(cartao: string) {
    if (!user) return;
    const existente = todas.find((f) => f.mes === mes && f.nome === cartao);
    try {
      const batch = writeBatch(db);
      const ref = doc(db, "usuarios", user.uid, "faturasCartao", chave(mes, cartao));
      batch.delete(ref);
      if (existente && existente.valor > 0) {
        anexarAuditLog(batch, user.uid, user.email, {
          action: "archived",
          entityType: "fatura",
          entityId: existente.id,
          summary: `Fatura "${cartao}" de ${mes} excluída (era ${formatarMoeda(existente.valor)})`,
          before: { valor: existente.valor },
        });
      }
      await batch.commit();
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  const total = faturas.reduce((acc, f) => acc + f.valor, 0);

  return { faturas, loading, erro, total, salvar, excluir };
}
