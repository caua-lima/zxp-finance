"use client";

import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";

interface UsuarioApi {
  uid: string;
  email: string | null;
  disabled: boolean;
  criadoEm: string;
  ultimoLogin: string;
}

function formatarData(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function AcessoPage() {
  const { user } = useAuth();
  const [usuarios, setUsuarios] = useState<UsuarioApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [criando, setCriando] = useState(false);

  async function chamarApi(
    input: string,
    init: RequestInit = {}
  ): Promise<{ ok: boolean; dados: Record<string, unknown> }> {
    const token = await user?.getIdToken();
    const resposta = await fetch(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
    });
    const dados = await resposta.json().catch(() => ({}));
    return { ok: resposta.ok, dados };
  }

  async function carregar() {
    setLoading(true);
    const { ok, dados } = await chamarApi("/api/usuarios");
    if (ok) {
      setUsuarios(dados.usuarios as UsuarioApi[]);
      setErro(null);
    } else {
      setErro((dados.erro as string) ?? "Erro ao carregar usuários.");
    }
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial de dados no mount
    if (user) carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    if (!email.trim() || !senha) return;
    setCriando(true);
    const { ok, dados } = await chamarApi("/api/usuarios", {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), senha }),
    });
    setCriando(false);
    if (ok) {
      setEmail("");
      setSenha("");
      carregar();
    } else {
      setErro((dados.erro as string) ?? "Erro ao criar login.");
    }
  }

  async function alternarAtivo(uid: string, disabled: boolean) {
    const { ok, dados } = await chamarApi(`/api/usuarios/${uid}`, {
      method: "PATCH",
      body: JSON.stringify({ disabled }),
    });
    if (ok) carregar();
    else setErro((dados.erro as string) ?? "Erro ao atualizar login.");
  }

  async function excluir(uid: string) {
    const { ok, dados } = await chamarApi(`/api/usuarios/${uid}`, {
      method: "DELETE",
    });
    if (ok) carregar();
    else setErro((dados.erro as string) ?? "Erro ao excluir login.");
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Acesso</h1>
      <p className="text-xs text-text-faint mb-4">
        Logins que podem entrar neste app
      </p>
      <ErroBanner mensagem={erro} />

      <form
        onSubmit={handleCriar}
        className="rounded-2xl border border-line bg-surface p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-2"
      >
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <input
          type="password"
          placeholder="Senha (mín. 6 caracteres)"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={criando}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors disabled:opacity-50"
        >
          {criando ? "Criando..." : "Criar login"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-text-faint">Carregando...</p>
      ) : usuarios.length === 0 ? (
        <p className="text-sm text-text-faint">Nenhum login encontrado.</p>
      ) : (
        <ul className="space-y-2">
          {usuarios.map((u) => (
            <ItemUsuario
              key={u.uid}
              usuario={u}
              souEu={u.uid === user?.uid}
              onAlternarAtivo={alternarAtivo}
              onExcluir={excluir}
              onEditado={carregar}
              chamarApi={chamarApi}
              setErro={setErro}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemUsuario({
  usuario,
  souEu,
  onAlternarAtivo,
  onExcluir,
  onEditado,
  chamarApi,
  setErro,
}: {
  usuario: UsuarioApi;
  souEu: boolean;
  onAlternarAtivo: (uid: string, disabled: boolean) => void;
  onExcluir: (uid: string) => void;
  onEditado: () => void;
  chamarApi: (
    input: string,
    init?: RequestInit
  ) => Promise<{ ok: boolean; dados: Record<string, unknown> }>;
  setErro: (erro: string | null) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [email, setEmail] = useState(usuario.email ?? "");
  const [novaSenha, setNovaSenha] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  async function salvar() {
    setSalvando(true);
    const { ok, dados } = await chamarApi(`/api/usuarios/${usuario.uid}`, {
      method: "PATCH",
      body: JSON.stringify({
        email: email.trim() !== usuario.email ? email.trim() : undefined,
        senha: novaSenha || undefined,
      }),
    });
    setSalvando(false);
    if (ok) {
      setNovaSenha("");
      setEditando(false);
      onEditado();
    } else {
      setErro((dados.erro as string) ?? "Erro ao editar login.");
    }
  }

  if (editando) {
    return (
      <li className="rounded-xl border border-brand/40 bg-surface px-4 py-3 space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <input
          type="password"
          placeholder="Nova senha (deixe em branco pra manter)"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <div className="flex gap-2">
          <button
            onClick={salvar}
            disabled={salvando}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-[#0E0F0C] disabled:opacity-50"
          >
            {salvando ? "Salvando..." : "Salvar"}
          </button>
          <button
            onClick={() => setEditando(false)}
            className="rounded-lg border border-line px-3 py-1.5 text-xs text-text-muted"
          >
            Cancelar
          </button>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-center justify-between gap-2 rounded-xl border bg-surface px-4 py-3 ${
        usuario.disabled ? "border-line-soft opacity-50" : "border-line"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm truncate">
          {usuario.email}
          {souEu && (
            <span className="ml-2 text-xs text-brand">(você)</span>
          )}
        </p>
        <p className="text-xs text-text-faint">
          Criado em {formatarData(usuario.criadoEm)}
          {usuario.ultimoLogin &&
            ` · último acesso ${formatarData(usuario.ultimoLogin)}`}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer">
          <input
            type="checkbox"
            checked={!usuario.disabled}
            onChange={(e) =>
              onAlternarAtivo(usuario.uid, !e.target.checked)
            }
            className="h-4 w-4 accent-brand"
          />
          Ativo
        </label>
        <button
          onClick={() => setEditando(true)}
          className="text-text-faint hover:text-brand text-sm"
          aria-label="Editar"
        >
          ✎
        </button>
        <button
          onClick={() => setConfirmandoExclusao(true)}
          disabled={souEu}
          className="text-text-faint hover:text-negative text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="Excluir"
          title={souEu ? "Você não pode excluir sua própria conta" : "Excluir"}
        >
          ✕
        </button>
      </div>

      <ConfirmModal
        aberto={confirmandoExclusao}
        titulo="Excluir login"
        descricao={`"${usuario.email}" não vai conseguir mais entrar no app. Essa ação não pode ser desfeita.`}
        textoConfirmar="Excluir"
        perigo
        onConfirmar={() => {
          onExcluir(usuario.uid);
          setConfirmandoExclusao(false);
        }}
        onCancelar={() => setConfirmandoExclusao(false)}
      />
    </li>
  );
}
