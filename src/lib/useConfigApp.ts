"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import {
  configurarInicioHistorico,
  configurarInicioUso,
  configurarTaxaImposto,
  MES_MINIMO,
  TAXA_IMPOSTO,
} from "./types";

export interface ConfigApp {
  /** Fração (0.06 = 6%). */
  taxaImposto: number;
  /** "AAAA-MM". */
  inicioHistorico: string;
  /** "AAAA-MM-DD" ou "" — dia em que o cliente começou a valer no app. */
  inicioUso: string;
  /**
   * Marcar ganho como recebido soma o líquido ao saldo. Ausente = false:
   * conta antiga continua como era (saldo isolado dos ganhos); conta nova
   * por convite já nasce com true.
   */
  entradasNoSaldo: boolean;
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
        const uso = typeof dados.inicioUso === "string" ? dados.inicioUso : "";
        const entradasNoSaldo = dados.entradasNoSaldo === true;
        configurarTaxaImposto(taxa);
        configurarInicioHistorico(inicio);
        configurarInicioUso(uso);
        setConfig({ taxaImposto: taxa, inicioHistorico: inicio, inicioUso: uso, entradasNoSaldo });
      },
      () => {
        // erro de leitura: volta TUDO ao padrão — nunca herda a configuração
        // de quem usou o app antes neste navegador (auditoria 25/10 F07)
        configurarTaxaImposto(TAXA_IMPOSTO);
        configurarInicioHistorico(inicioPadrao);
        configurarInicioUso("");
        setConfig({ taxaImposto: TAXA_IMPOSTO, inicioHistorico: inicioPadrao, inicioUso: "", entradasNoSaldo: false });
      }
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
    versao: config ? `${config.taxaImposto}:${config.inicioHistorico}:${config.inicioUso}` : null,
    salvar,
  };
}
