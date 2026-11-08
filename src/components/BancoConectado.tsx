"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useAuth } from "@/lib/AuthContext";
import { formatarMoeda } from "@/lib/types";
import { useToast } from "@/components/Toast";
import type { StatusBanco } from "@/lib/pluggy/sincronizar";

// widget oficial da Pluggy: só no navegador, carregado quando for usar
const PluggyConnect = dynamic(() => import("react-pluggy-connect").then((m) => m.PluggyConnect), { ssr: false });
/** Conector "MeuPluggy": as contas que você já conectou no meu.pluggy.ai. */
const CONECTOR_MEU_PLUGGY = 200;

const quando = (ms: number) =>
  new Date(ms).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function resumoEmTexto(s: StatusBanco): string {
  const n = s.resumo?.novos;
  if (!n) return "";
  const partes = [
    n.gasto + n.gasto_credito > 0 && `${n.gasto + n.gasto_credito} registro(s)`,
    n.pago > 0 && `${n.pago} conta(s) paga(s)`,
    n.ganho > 0 && `${n.ganho} entrada(s)`,
    n.vinculado > 0 && `${n.vinculado} ligado(s) ao que você anotou`,
  ].filter(Boolean);
  return partes.length ? partes.join(" · ") : "nada novo";
}

/**
 * Banco conectado (Open Finance via Meu Pluggy): quando o banco foi lido,
 * o que entrou na última sincronização e o botão de sincronizar. Pra quem
 * não tem banco conectado, não aparece.
 */
export function BancoConectado() {
  const { user } = useAuth();
  const toast = useToast();
  const [disponivel, setDisponivel] = useState(false);
  const [conectado, setConectado] = useState(false);
  const [tokenConexao, setTokenConexao] = useState<string | null>(null);
  const [conectando, setConectando] = useState(false);
  const [status, setStatus] = useState<StatusBanco | null>(null);
  const [sincronizando, setSincronizando] = useState(false);

  const chamar = useCallback(
    async (metodo: "GET" | "POST") => {
      if (!user) return null;
      const token = await user.getIdToken();
      const r = await fetch("/api/banco", { method: metodo, headers: { Authorization: `Bearer ${token}` } });
      const corpo = (await r.json().catch(() => null)) as
        | { disponivel?: boolean; conectado: boolean; status: StatusBanco | null; aguarde?: boolean }
        | null;
      if (!corpo) return null;
      setDisponivel(!!corpo.disponivel);
      setConectado(corpo.conectado);
      setStatus(corpo.status);
      return corpo;
    },
    [user]
  );

  useEffect(() => {
    if (!user) return;
    let ativo = true;
    user
      .getIdToken()
      .then((token) => fetch("/api/banco", { headers: { Authorization: `Bearer ${token}` } }))
      .then((r) => r.json())
      .then((corpo: { disponivel?: boolean; conectado: boolean; status: StatusBanco | null }) => {
        if (!ativo) return;
        setDisponivel(!!corpo.disponivel);
        setConectado(corpo.conectado);
        setStatus(corpo.status);
      })
      .catch(() => undefined);
    return () => {
      ativo = false;
    };
  }, [user]);

  if (!disponivel) return null;

  async function abrirConexao() {
    if (!user) return;
    setConectando(true);
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/banco/conectar", { headers: { Authorization: `Bearer ${token}` } });
      const corpo = (await r.json()) as { accessToken?: string; erro?: string };
      if (!corpo.accessToken) throw new Error(corpo.erro);
      setTokenConexao(corpo.accessToken);
    } catch (e) {
      toast.erro(e instanceof Error && e.message ? e.message : "A Pluggy não liberou a conexão agora.");
      setConectando(false);
    }
  }

  async function aoConectar(itemId: string) {
    setTokenConexao(null);
    setConectando(false);
    if (!user) return;
    const token = await user.getIdToken();
    const r = await fetch("/api/banco/conectar", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
    if (!r.ok) {
      toast.erro("A conexão foi feita, mas não consegui guardar. Tente de novo.");
      return;
    }
    toast.sucesso("Banco conectado. Toque em Sincronizar agora.");
    await chamar("GET");
  }

  const widget = tokenConexao && (
    <PluggyConnect
      connectToken={tokenConexao}
      includeSandbox={false}
      connectorIds={[CONECTOR_MEU_PLUGGY]}
      selectedConnectorId={CONECTOR_MEU_PLUGGY}
      onSuccess={({ item }) => aoConectar(item.id)}
      onError={() => toast.erro("A conexão com o banco não terminou. Tente de novo.")}
      onClose={() => {
        setTokenConexao(null);
        setConectando(false);
      }}
    />
  );

  if (!conectado) {
    return (
      <div className="mb-3 rounded-2xl border border-brand/30 bg-brand-soft/30 p-4">
        <p className="text-sm font-medium">🏦 Conecte seu banco</p>
        <p className="mt-0.5 text-xs text-text-muted">
          Saldo, gastos, contas pagas e cofrinhos entram sozinhos, pelo Open Finance (Meu Pluggy). Na janela que
          abrir, entre no Meu Pluggy e autorize.
        </p>
        <button
          type="button"
          onClick={abrirConexao}
          disabled={conectando}
          className="mt-2 min-h-[40px] rounded-xl bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-dark disabled:opacity-50"
        >
          {conectando ? "Abrindo..." : "Conectar banco"}
        </button>
        {widget}
      </div>
    );
  }

  async function sincronizar() {
    setSincronizando(true);
    try {
      const r = await chamar("POST");
      if (!r?.status) toast.erro("Não consegui falar com o banco agora.");
      else if (r.status.erro) toast.erro(r.status.erro);
      else if (r.aguarde) toast.sucesso("Acabou de sincronizar. Tente de novo em um minuto.");
      else toast.sucesso(`Banco sincronizado: ${resumoEmTexto(r.status)}.`);
    } catch {
      toast.erro("Não consegui falar com o banco agora.");
    } finally {
      setSincronizando(false);
    }
  }

  const problema = status?.itens.find((i) => i.status === "LOGIN_ERROR" || i.status === "OUTDATED");
  const investido = status?.contas.reduce((a, c) => a + (c.investidoAutomatico ?? 0), 0) ?? 0;

  return (
    <div className="mb-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">🏦 Banco conectado</p>
          <p className="text-xs text-text-muted">
            {status?.bancoLidoEm
              ? `Saldo e extrato do banco de ${quando(status.bancoLidoEm)}`
              : "Ainda não sincronizado"}
            {status?.ultimaSincronizacao ? ` · conferido ${quando(status.ultimaSincronizacao)}` : ""}
          </p>
          {status?.resumo && !status.erro && (
            <p className="mt-0.5 text-xs text-text-faint">Última vez: {resumoEmTexto(status)}</p>
          )}
          {investido > 0 && (
            <p className="mt-0.5 text-xs text-text-faint">
              Rendendo automático na conta: {formatarMoeda(investido)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={sincronizar}
          disabled={sincronizando}
          className="min-h-[40px] shrink-0 rounded-xl border border-brand/40 px-3 text-xs font-semibold text-brand hover:bg-brand-soft disabled:opacity-50"
        >
          {sincronizando ? "Sincronizando..." : "Sincronizar agora"}
        </button>
      </div>
      {status?.erro && <p className="mt-2 text-xs text-negative">{status.erro}</p>}
      {problema && (
        <p className="mt-2 text-xs text-negative">
          A conexão com o banco expirou. Abra o Meu Pluggy e reconecte o banco.
        </p>
      )}
    </div>
  );
}
