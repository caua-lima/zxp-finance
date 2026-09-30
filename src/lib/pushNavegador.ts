"use client";

/**
 * Funções de push que só dependem do navegador — sem React e sem sessão.
 * Ficam fora do hook pra o AuthContext poder revogar o push no logout
 * sem importar o hook (que importa o AuthContext).
 */

const CHAVE_DONO = "zxp_push_dono";

export function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Padded = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Padded);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

/** Mesmo id do servidor: sha256 do endpoint, em hex. */
export async function idDoAparelho(endpoint: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function lerDono(): string | null {
  try {
    return localStorage.getItem(CHAVE_DONO);
  } catch {
    return null;
  }
}
export function gravarDono(uid: string | null) {
  try {
    if (uid) localStorage.setItem(CHAVE_DONO, uid);
    else localStorage.removeItem(CHAVE_DONO);
  } catch {
    /* navegador sem armazenamento: segue sem o reparo automático */
  }
}

/**
 * Desliga o push deste navegador provando posse do endpoint — funciona
 * até sem sessão (logout). Usado pelo AuthContext antes de sair.
 */
export async function revogarPushDesteNavegador(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registro = await navigator.serviceWorker.getRegistration();
  const sub = await registro?.pushManager.getSubscription();
  if (sub) {
    // servidor primeiro: se desinscrever antes e a chamada falhar, não
    // teria mais como provar posse pra apagar o vínculo
    await fetch("/api/push/revogar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    await sub.unsubscribe();
  }
  gravarDono(null);
}

