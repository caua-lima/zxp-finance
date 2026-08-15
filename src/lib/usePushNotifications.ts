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

  useEffect(() => {
    const suporta =
      typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detecta suporte do navegador só depois de montar (evita mismatch de SSR)
    setSuportado(suporta);
    if (suporta) setPermissao(Notification.permission);
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

  return { suportado, permissao, ativo, carregando, erro, ativar, desativar };
}
