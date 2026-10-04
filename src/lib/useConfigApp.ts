"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import {
  configurarInicioHistorico,
  configurarTaxaImposto,
  MES_MINIMO,
  TAXA_IMPOSTO,
} from "./types";

export interface ConfigApp {
  /** Fração (0.06 = 6%). */
  taxaImposto: number;
  /** "AAAA-MM". */
  inicioHistorico: string;
}

/**
 * Configuração por cliente do que antes era regra fixa do dono (auditoria
 * O03): taxa de imposto e início do histórico. Sem nada salvo: imposto de
 * 6% e histórico a partir do mês do cadastro (nunca antes de agosto/2026,
 * que é quando o app começou).
 *
 * Aplica nos valores globais usados pelos cálculos e devolve uma "versão"
 * pro layout remontar as telas quando mudar — senão cálculo já memorizado
 * ficaria com o valor antigo.
 */
export function useConfigApp() {
  const { user } = useAuth();
  const [config, setConfig] = useState<ConfigApp | null>(null);

  useEffect(() => {
    if (!user) return;
    const criado = user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;
    const mesCadastro = criado
      ? `${criado.getFullYear()}-${String(criado.getMonth() + 1).padStart(2, "0")}`
      : MES_MINIMO;
    const inicioPadrao = mesCadastro > MES_MINIMO ? mesCadastro : MES_MINIMO;

    return onSnapshot(
      doc(db, "usuarios", user.uid, "preferencias", "app"),
      (snap) => {
        const dados = snap.exists() ? snap.data() : {};
        const taxa = typeof dados.taxaImposto === "number" ? dados.taxaImposto : TAXA_IMPOSTO;
        const inicio =
          typeof dados.inicioHistorico === "string" ? dados.inicioHistorico : inicioPadrao;
        configurarTaxaImposto(taxa);
        configurarInicioHistorico(inicio);
        setConfig({ taxaImposto: taxa, inicioHistorico: inicio });
      },
      () => setConfig({ taxaImposto: TAXA_IMPOSTO, inicioHistorico: inicioPadrao })
    );
  }, [user]);

  async function salvar(dados: Partial<ConfigApp>) {
    if (!user) return false;
    try {
      await setDoc(doc(db, "usuarios", user.uid, "preferencias", "app"), dados, { merge: true });
      return true;
    } catch {
      return false;
    }
  }

  return {
    config,
    versao: config ? `${config.taxaImposto}:${config.inicioHistorico}` : null,
    salvar,
  };
}
