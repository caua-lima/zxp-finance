"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Logo } from "@/components/Logo";
import { MENSAGEM_BLOQUEIO, MotivoBloqueio } from "@/lib/acesso/concessao";

/**
 * Tela de quem está sem acesso liberado (auditoria 25/10 B14/B16): diz o
 * motivo, deixa exportar os próprios dados (nada é apagado) e sair.
 */
export function AcessoBloqueado({ motivo }: { motivo: MotivoBloqueio }) {
  const { user, logout } = useAuth();
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function exportar() {
    if (!user) return;
    setExportando(true);
    setErro(null);
    try {
      const r = await fetch("/api/conta/exportar", { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `zxp-finance-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não consegui gerar o arquivo agora. Tente de novo.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-line bg-surface p-6 text-center">
        <div className="flex justify-center">
          <Logo size="lg" />
        </div>
        <h1 className="text-base font-semibold">Acesso indisponível</h1>
        <p className="text-sm text-text-muted">{MENSAGEM_BLOQUEIO[motivo]}</p>
        {erro && (
          <p role="alert" className="text-sm text-negative">
            {erro}
          </p>
        )}
        {motivo !== "sem_concessao" && (
          <button
            type="button"
            onClick={exportar}
            disabled={exportando}
            className="min-h-[44px] w-full rounded-xl border border-line text-sm font-medium disabled:opacity-50"
          >
            {exportando ? "Gerando..." : "Baixar meus dados"}
          </button>
        )}
        <button
          type="button"
          onClick={logout}
          className="min-h-[44px] w-full rounded-xl bg-brand text-sm font-semibold text-on-brand"
        >
          Sair
        </button>
      </div>
    </main>
  );
}
