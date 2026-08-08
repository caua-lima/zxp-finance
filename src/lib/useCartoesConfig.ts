"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, doc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { CARTOES_PREDEFINIDOS } from "./cartoes";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";

export interface CartaoConfig {
  nome: string;
  limite?: number;
  diaFechamento?: number; // 1-31
  diaVencimento?: number; // 1-31
}

/**
 * Configuração do cartão em si (limite, fechamento, vencimento) —
 * diferente de FaturaCartao, que é o valor lançado por mês. Um cartão só
 * tem um limite/fechamento/vencimento, não um por mês, então fica numa
 * coleção separada (usuarios/{uid}/cartoesConfig/{cartao}) em vez de
 * duplicar o dado em cada doc mensal.
 */
export function useCartoesConfig() {
  const { user } = useAuth();
  const [todas, setTodas] = useState<CartaoConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      collection(db, "usuarios", user.uid, "cartoesConfig"),
      (snap) => {
        setTodas(snap.docs.map((d) => d.data() as CartaoConfig));
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

  const configs = useMemo(() => {
    return CARTOES_PREDEFINIDOS.map(
      (cartao) => todas.find((c) => c.nome === cartao) ?? { nome: cartao }
    );
  }, [todas]);

  async function salvar(
    cartao: string,
    dados: { limite?: number; diaFechamento?: number; diaVencimento?: number }
  ) {
    if (!user) return;
    try {
      await setDoc(doc(db, "usuarios", user.uid, "cartoesConfig", cartao), {
        nome: cartao,
        limite: dados.limite ?? null,
        diaFechamento: dados.diaFechamento ?? null,
        diaVencimento: dados.diaVencimento ?? null,
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { configs, loading, erro, salvar };
}
