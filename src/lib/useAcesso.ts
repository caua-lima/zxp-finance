"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { avaliarAcesso, Concessao, ConfigPlataforma, DecisaoAcesso } from "./acesso/concessao";

/**
 * A decisão de acesso pro usuário logado, ao vivo: a mesma que as regras
 * do Firestore aplicam. Serve pra mostrar "seu acesso está suspenso" em
 * vez de uma tela cheia de erro de permissão. `null` = ainda lendo.
 */
export function useAcesso(): DecisaoAcesso | null {
  const { user } = useAuth();
  const [concessao, setConcessao] = useState<Concessao | null | undefined>(undefined);
  const [config, setConfig] = useState<ConfigPlataforma | null | undefined>(undefined);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    if (!user) return;
    const pararConcessao = onSnapshot(
      doc(db, "acessos", user.uid),
      (s) => setConcessao(s.exists() ? (s.data() as Concessao) : null),
      () => setConcessao(null)
    );
    const pararConfig = onSnapshot(
      doc(db, "plataforma", "config"),
      (s) => setConfig(s.exists() ? (s.data() as ConfigPlataforma) : null),
      () => setConfig(null)
    );
    // prazo vence sozinho: reavalia a cada minuto
    const relogio = setInterval(() => setAgora(Date.now()), 60_000);
    return () => {
      pararConcessao();
      pararConfig();
      clearInterval(relogio);
    };
  }, [user]);

  const decisao =
    concessao === undefined || config === undefined ? null : avaliarAcesso(concessao, config, agora);

  // concessão e chave chegam por listeners separados: por um instante a
  // combinação pode parecer "bloqueado" (ex: a chave liga antes de a
  // concessão chegar). Só bloqueia se continuar assim por 1,5 s — senão a
  // tela inteira desmontaria e perderia o que a pessoa estava fazendo.
  const [bloqueioConfirmado, setBloqueioConfirmado] = useState(false);
  // quem JÁ ENTRA bloqueado vê a tela na hora; a espera é só pra transição
  const [viuLiberado, setViuLiberado] = useState(false);
  const liberadaAgora = decisao?.liberado === true;
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marca que a sessão já esteve liberada
    if (liberadaAgora) setViuLiberado(true);
  }, [liberadaAgora]);
  const bloqueadaAgora = decisao !== null && !decisao.liberado;
  useEffect(() => {
    if (!bloqueadaAgora) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- desfaz o bloqueio assim que a decisão libera
      setBloqueioConfirmado(false);
      return;
    }
    const t = setTimeout(() => setBloqueioConfirmado(true), 1500);
    return () => clearTimeout(t);
  }, [bloqueadaAgora]);

  if (decisao === null) return null;
  if (!decisao.liberado && viuLiberado && !bloqueioConfirmado) return { liberado: true, motivo: null };
  return decisao;
}
