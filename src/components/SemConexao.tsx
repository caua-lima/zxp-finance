"use client";

import { useEffect, useState } from "react";

/**
 * Aviso de sem internet (auditoria: estado offline com recuperação). O
 * Firestore guarda o que você registrar enquanto estiver offline e envia
 * quando a conexão volta — a faixa explica isso em vez de o app parecer
 * travado.
 */
export function SemConexao() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const atualizar = () => setOffline(!navigator.onLine);
    atualizar();
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    return () => {
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="mx-auto mb-4 max-w-3xl rounded-xl border border-gold/30 bg-gold-soft px-4 py-3 text-sm text-gold"
    >
      Sem internet. O que você registrar agora fica guardado neste aparelho e é enviado quando a
      conexão voltar — não feche o app até lá.
    </div>
  );
}
