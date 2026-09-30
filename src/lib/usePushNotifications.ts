"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./AuthContext";
import {
  urlBase64ToUint8Array,
  idDoAparelho,
  lerDono,
  gravarDono,
  revogarPushDesteNavegador,
} from "./pushNavegador";

/**
 * Push deste aparelho, com estado honesto (auditoria N01/N02).
 *
 * Antes: "ativo" era só "o navegador tem uma inscrição" — que podia ser de
 * outra conta, ou ter sido apagada no servidor. E o navegador gravava a
 * inscrição direto no banco. Agora:
 *  - o cadastro passa pela API (validada no servidor);
 *  - "vinculado" é confirmado no servidor PRA CONTA LOGADA;
 *  - inscrição de outra conta neste navegador é revogada e desligada
 *    (conta nova não herda avisos da anterior);
 *  - inscrição desta conta que sumiu do servidor é reparada sozinha, sem
 *    pedir permissão de novo.
 */

export type EstadoPush =
  | "verificando"
  | "sem_suporte"
  | "precisa_instalar"
  | "negada"
  | "desligado"
  | "registrando"
  | "vinculado"
  | "erro";

export function usePushNotifications() {
  const { user } = useAuth();
  const [estado, setEstado] = useState<EstadoPush>("verificando");
  const [erro, setErro] = useState<string | null>(null);
  const [aparelho, setAparelho] = useState<string | null>(null);

  const chamar = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const token = await user?.getIdToken();
      const r = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
      });
      const dados = await r.json().catch(() => ({}));
      return { ok: r.ok, status: r.status, dados: dados as Record<string, unknown> };
    },
    [user]
  );

  const cadastrar = useCallback(
    async (sub: PushSubscription) => {
      const json = sub.toJSON();
      const r = await chamar("/api/push/inscricao", {
        method: "POST",
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
      });
      if (!r.ok) throw new Error((r.dados.erro as string) ?? "Não consegui ativar.");
      return r.dados.aparelho as string;
    },
    [chamar]
  );

  // estado inicial: suporte, instalação, permissão e vínculo real
  useEffect(() => {
    if (!user) return;
    let ativo = true;
    (async () => {
      const suporta = "serviceWorker" in navigator && "PushManager" in window;
      const ua = navigator.userAgent;
      const ios = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
      const instalado =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!suporta) {
        if (ativo) setEstado(ios && !instalado ? "precisa_instalar" : "sem_suporte");
        return;
      }
      try {
        const registro = await navigator.serviceWorker.register("/sw.js");
        const sub = await registro.pushManager.getSubscription();
        if (!sub) {
          if (ativo) setEstado(Notification.permission === "denied" ? "negada" : "desligado");
          return;
        }
        const id = await idDoAparelho(sub.endpoint);
        const r = await chamar(`/api/push/status?aparelho=${id}`);
        if (r.ok && r.dados.vinculado) {
          if (ativo) {
            setAparelho(id);
            setEstado("vinculado");
          }
          return;
        }
        if (lerDono() === user.uid && Notification.permission === "granted") {
          // era desta conta e sumiu do servidor: repara sem pedir permissão
          const novo = await cadastrar(sub);
          if (ativo) {
            setAparelho(novo);
            setEstado("vinculado");
          }
          return;
        }
        // inscrição de outra conta (ou de ninguém): não herda — desliga
        await revogarPushDesteNavegador();
        if (ativo) setEstado("desligado");
      } catch {
        if (ativo) {
          setEstado("erro");
          setErro("Não consegui verificar as notificações deste aparelho.");
        }
      }
    })();
    return () => {
      ativo = false;
    };
  }, [user, chamar, cadastrar]);

  /** Só por gesto do usuário (tocar em Ativar) — nunca ao carregar. */
  const ativar = useCallback(async () => {
    if (!user) return;
    setErro(null);
    setEstado("registrando");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setEstado(perm === "denied" ? "negada" : "desligado");
        return;
      }
      const chavePublica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!chavePublica) throw new Error("Notificações não estão configuradas neste ambiente.");
      const registro = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      let sub = await registro.pushManager.getSubscription();
      if (!sub) {
        sub = await registro.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(chavePublica) as BufferSource,
        });
      }
      const id = await cadastrar(sub);
      gravarDono(user.uid);
      setAparelho(id);
      setEstado("vinculado");
    } catch (e) {
      setEstado("erro");
      setErro(e instanceof Error ? e.message : "Não consegui ativar.");
    }
  }, [user, cadastrar]);

  const desativar = useCallback(async () => {
    setErro(null);
    try {
      if (aparelho) {
        const r = await chamar(`/api/push/inscricao?aparelho=${aparelho}`, { method: "DELETE" });
        if (!r.ok) throw new Error((r.dados.erro as string) ?? "Não consegui desativar.");
      }
      const registro = await navigator.serviceWorker.getRegistration();
      await (await registro?.pushManager.getSubscription())?.unsubscribe();
      gravarDono(null);
      setAparelho(null);
      setEstado("desligado");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não consegui desativar.");
    }
  }, [aparelho, chamar]);

  /** Dispara um push de teste pra este aparelho e diz o que aconteceu. */
  const testar = useCallback(async (): Promise<string> => {
    if (!aparelho) return "Ative as notificações primeiro.";
    const r = await chamar("/api/push/teste", {
      method: "POST",
      body: JSON.stringify({ aparelho }),
    });
    if (!r.ok) return (r.dados.erro as string) ?? "O teste falhou.";
    if (r.dados.aceita)
      return "Enviado. O serviço de push do aparelho recebeu — deve aparecer em instantes. Se não aparecer, confira se o sistema não está silenciando o app.";
    if (r.dados.inscricaoEncerrada) {
      setEstado("desligado");
      return "A inscrição deste aparelho expirou. Ative de novo.";
    }
    if (r.dados.reagendada) return "O serviço de push não respondeu agora. Vou tentar de novo sozinho.";
    return "O envio falhou. Tente ativar de novo.";
  }, [aparelho, chamar]);

  return { estado, erro, aparelho, ativar, desativar, testar };
}
