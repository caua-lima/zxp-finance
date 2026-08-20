"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { ComissaoConfig, COMISSAO_PADRAO } from "./types";

/**
 * Valor de cada tipo de comissão (usuarios/{uid}/comissaoConfig/atual).
 * Enquanto não for salvo, usa COMISSAO_PADRAO — os valores que o usuário
 * informou (R$12/reunião, R$30/venda performance, R$45/venda acelera).
 */
export function useComissaoConfig() {
  const { user } = useAuth();
  const [config, setConfig] = useState<ComissaoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, "usuarios", user.uid, "comissaoConfig", "atual"),
      (snap) => {
        setConfig(snap.exists() ? (snap.data() as ComissaoConfig) : null);
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

  const valores = config ?? { ...COMISSAO_PADRAO, atualizadoEm: 0 };

  async function salvar(dados: {
    valorReuniao: number;
    valorVendaPerformance: number;
    valorVendaAcelera: number;
  }) {
    if (!user) return;
    try {
      await setDoc(doc(db, "usuarios", user.uid, "comissaoConfig", "atual"), {
        ...dados,
        atualizadoEm: Date.now(),
      });
      setErro(null);
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { valores, personalizado: !!config, loading, erro, salvar };
}
