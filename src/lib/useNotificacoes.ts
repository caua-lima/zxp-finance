"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { PreferenciasNotificacao, preferenciasPadrao, TipoNotificacao } from "./notificacoes/regras";

export interface NotificacaoCentral {
  id: string;
  tipo: TipoNotificacao;
  titulo: string;
  corpo: string;
  url: string;
  criadaEm: number;
  lidaEm?: number;
  estimado?: boolean;
}

/**
 * Central de notificações: a lista durável de avisos (auditoria N03). Push
 * é só um canal — se ele falhar, o aviso continua aqui. Você só consegue
 * marcar como lida (regras do Firestore).
 */
export function useNotificacoes() {
  const { user } = useAuth();
  const [itens, setItens] = useState<NotificacaoCentral[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, "usuarios", user.uid, "notificacoes"),
      orderBy("criadaEm", "desc"),
      limit(60)
    );
    return onSnapshot(
      q,
      (snap) => {
        setItens(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NotificacaoCentral));
        setLoading(false);
        setErro(null);
      },
      (e) => {
        setErro(mensagemErro(e));
        setLoading(false);
      }
    );
  }, [user]);

  const naoLidas = itens.filter((n) => !n.lidaEm).length;

  async function marcarLida(id: string) {
    if (!user) return;
    try {
      await updateDoc(doc(db, "usuarios", user.uid, "notificacoes", id), { lidaEm: Date.now() });
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  async function marcarTodasLidas() {
    if (!user) return;
    try {
      const batch = writeBatch(db);
      for (const n of itens.filter((n) => !n.lidaEm)) {
        batch.update(doc(db, "usuarios", user.uid, "notificacoes", n.id), { lidaEm: Date.now() });
      }
      await batch.commit();
    } catch (e) {
      setErro(mensagemErro(e));
    }
  }

  return { itens, naoLidas, loading, erro, marcarLida, marcarTodasLidas };
}

/** Preferências por assunto. Comissão é opt-in (liga sozinha só pra quem usa). */
export function usePreferenciasNotificacao(usaComissoes: boolean) {
  const { user } = useAuth();
  const [salvas, setSalvas] = useState<Partial<PreferenciasNotificacao> | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "usuarios", user.uid, "preferencias", "notificacoes"),
      (snap) => setSalvas(snap.exists() ? (snap.data() as Partial<PreferenciasNotificacao>) : {}),
      (e) => setErro(mensagemErro(e))
    );
  }, [user]);

  const prefs: PreferenciasNotificacao = { ...preferenciasPadrao(usaComissoes), ...(salvas ?? {}) };

  async function alterar(chave: keyof PreferenciasNotificacao, valor: boolean) {
    if (!user) return false;
    try {
      await setDoc(
        doc(db, "usuarios", user.uid, "preferencias", "notificacoes"),
        { [chave]: valor, atualizadoEm: Date.now() },
        { merge: true }
      );
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  return { prefs, carregado: salvas !== null, erro, alterar };
}
