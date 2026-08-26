"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, deleteDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

async function idDaInscricao(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Inscrição de push do dispositivo atual (usuarios/{uid}/pushInscricoes).
 * Um usuário pode ter várias — um por aparelho/navegador instalado.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const [suportado, setSuportado] = useState(false);
  const [permissao, setPermissao] = useState<NotificationPermission>("default");
  const [ativo, setAtivo] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ehIOS, setEhIOS] = useState(false);
  const [instalado, setInstalado] = useState(false);

  useEffect(() => {
    const suporta =
      typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detecta suporte do navegador só depois de montar (evita mismatch de SSR)
    setSuportado(suporta);
    if (suporta) setPermissao(Notification.permission);

    // iPadOS 13+ se identifica como Mac; o toque é o que diferencia de um
    // desktop de verdade.
    const ua = navigator.userAgent;
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
    setEhIOS(ios);

    // No iOS, push só existe rodando como app instalado na tela de início —
    // em aba do Safari o PushManager simplesmente não existe, e sem essa
    // detecção o usuário fica sem notificação e sem saber por quê.
    setInstalado(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  }, []);

  useEffect(() => {
    if (!suportado) return;
    navigator.serviceWorker
      .register("/sw.js")
      .then(async (registro) => {
        const sub = await registro.pushManager.getSubscription();
        setAtivo(!!sub);
      })
      .catch(() => {});
  }, [suportado]);

  const ativar = useCallback(async () => {
    if (!user || !suportado) return;
    setCarregando(true);
    setErro(null);
    try {
      const perm = await Notification.requestPermission();
      setPermissao(perm);
      if (perm !== "granted") {
        setErro("Permissão de notificação negada pelo navegador.");
        return;
      }

      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chavePublica) {
        throw new Error("Chave VAPID pública não configurada no ambiente.");
      }

      let sub = await registro.pushManager.getSubscription();
      if (!sub) {
        sub = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(chavePublica) as BufferSource,
        });
      }

      const json = sub.toJSON();
      const id = await idDaInscricao(sub.endpoint);
      await setDoc(doc(db, "usuarios", user.uid, "pushInscricoes", id), {
        endpoint: json.endpoint,
        keys: json.keys,
        criadoEm: Date.now(),
      });
      setAtivo(true);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [user, suportado]);

  const desativar = useCallback(async () => {
    if (!user) return;
    setCarregando(true);
    setErro(null);
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      const sub = await registro?.pushManager.getSubscription();
      if (sub) {
        const id = await idDaInscricao(sub.endpoint);
        await sub.unsubscribe();
        await deleteDoc(doc(db, "usuarios", user.uid, "pushInscricoes", id));
      }
      setAtivo(false);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, [user]);

  /**
   * iPhone/iPad em aba do navegador: precisa instalar na tela de início antes
   * de conseguir receber notificação. É o único caso em que dá pra explicar
   * o que fazer — nos outros, "não suportado" é definitivo.
   */
  const precisaInstalar = ehIOS && !instalado && !suportado;

  return {
    suportado,
    permissao,
    ativo,
    carregando,
    erro,
    precisaInstalar,
    instalado,
    ativar,
    desativar,
  };
}
