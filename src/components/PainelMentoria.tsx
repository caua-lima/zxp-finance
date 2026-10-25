"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Botao } from "@/components/Botao";

interface TurmaApi {
  id: string;
  nome: string;
  fimEm: number | null;
  criadoEm: number;
}

export interface PessoaApi {
  uid: string;
  email: string | null;
  ultimoLogin: string | null;
  estado: "ativo" | "suspenso" | "encerrado";
  origem: string;
  fimEm: number | null;
  diasRestantes: number | null;
}

const ROTULO_ESTADO: Record<PessoaApi["estado"], string> = {
  ativo: "Ativo",
  suspenso: "Suspenso",
  encerrado: "Encerrado",
};

const dataCurta = (ms: number) => new Date(ms).toLocaleDateString("pt-BR");

/**
 * Painel da mentoria pra administração (auditoria 25/10 B13): turmas,
 * convite com link pra copiar e quem está em cada turma — estado do
 * acesso e prazo, nunca as finanças de ninguém.
 */
export function PainelMentoria({
  acoes,
}: {
  /** Ações por pessoa (suspender, renovar...), quando o painel permite. */
  acoes?: (pessoa: PessoaApi, recarregar: () => void) => React.ReactNode;
}) {
  const { user } = useAuth();
  const [turmas, setTurmas] = useState<TurmaApi[]>([]);
  const [turmaAberta, setTurmaAberta] = useState<string | null>(null);
  const [pessoas, setPessoas] = useState<PessoaApi[]>([]);
  const [nome, setNome] = useState("");
  const [link, setLink] = useState<{ turmaId: string; url: string; expiraEm: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const chamar = useCallback(
    async (url: string, init: RequestInit = {}) => {
      const token = await user?.getIdToken();
      const r = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(dados.erro ?? "Erro ao falar com o servidor.");
      return dados;
    },
    [user]
  );

  const carregarTurmas = useCallback(async () => {
    try {
      setTurmas((await chamar("/api/admin/turmas")).turmas);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao carregar turmas.");
    }
  }, [chamar]);

  const carregarPessoas = useCallback(
    async (turmaId: string) => {
      try {
        setPessoas((await chamar(`/api/admin/acessos?turma=${encodeURIComponent(turmaId)}`)).pessoas);
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Erro ao carregar a turma.");
      }
    },
    [chamar]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- busca inicial no mount
    if (user) carregarTurmas();
  }, [user, carregarTurmas]);

  async function criarTurma(e: FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return;
    try {
      await chamar("/api/admin/turmas", { method: "POST", body: JSON.stringify({ nome: nome.trim() }) });
      setNome("");
      carregarTurmas();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao criar turma.");
    }
  }

  async function gerarConvite(turmaId: string) {
    try {
      const r = await chamar("/api/admin/convites", { method: "POST", body: JSON.stringify({ turmaId, validadeLinkDias: 7 }) });
      setLink({ turmaId, url: `${window.location.origin}${r.caminho}`, expiraEm: r.expiraEm });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao gerar convite.");
    }
  }

  function abrir(turmaId: string) {
    const fechar = turmaAberta === turmaId;
    setTurmaAberta(fechar ? null : turmaId);
    setPessoas([]);
    if (!fechar) carregarPessoas(turmaId);
  }

  return (
    <section aria-labelledby="mentoria-titulo" className="mb-6 rounded-2xl border border-line bg-surface p-4">
      <h2 id="mentoria-titulo" className="text-sm font-semibold">
        Mentoria
      </h2>
      <p className="mt-0.5 text-xs text-text-muted">
        Turmas e convites. Aqui aparece o acesso de cada pessoa — nunca as finanças dela.
      </p>
      {erro && (
        <p role="alert" className="mt-2 text-sm text-negative">
          {erro}
        </p>
      )}

      <form onSubmit={criarTurma} className="mt-3 flex gap-2">
        <label htmlFor="nova-turma" className="sr-only">
          Nome da turma
        </label>
        <input
          id="nova-turma"
          placeholder="Nome da turma nova"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="campo flex-1"
        />
        <Botao type="submit" variante="secundario" disabled={!nome.trim()}>
          Criar turma
        </Botao>
      </form>

      <ul className="mt-3 divide-y divide-line-soft">
        {turmas.length === 0 && <li className="py-2 text-sm text-text-muted">Nenhuma turma ainda.</li>}
        {turmas.map((t) => (
          <li key={t.id} className="py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => abrir(t.id)}
                aria-expanded={turmaAberta === t.id}
                className="min-h-[44px] text-left text-sm font-medium"
              >
                {t.nome}
                <span className="ml-1 text-xs font-normal text-text-muted">
                  desde {dataCurta(t.criadoEm)}
                  {t.fimEm ? ` · até ${dataCurta(t.fimEm)}` : ""}
                </span>
              </button>
              <Botao variante="secundario" tamanho="pequeno" onClick={() => gerarConvite(t.id)}>
                Gerar convite
              </Botao>
            </div>

            {link?.turmaId === t.id && (
              <div className="mt-2 rounded-xl bg-surface-2/60 p-3 text-xs">
                <p className="text-text-muted">
                  Link de uso único, vale até {dataCurta(link.expiraEm)}. Ele só aparece agora — copie e mande pra
                  pessoa.
                </p>
                <div className="mt-2 flex gap-2">
                  <input readOnly value={link.url} aria-label="Link do convite" className="campo flex-1 text-xs" />
                  <Botao
                    tamanho="pequeno"
                    onClick={() => navigator.clipboard?.writeText(link.url)}
                  >
                    Copiar
                  </Botao>
                </div>
              </div>
            )}

            {turmaAberta === t.id && (
              <ul className="mt-2 space-y-1.5">
                {pessoas.length === 0 && <li className="text-xs text-text-muted">Ninguém aceitou convite ainda.</li>}
                {pessoas.map((p) => (
                  <li key={p.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-2/40 px-3 py-2">
                    <span className="min-w-0 text-sm">
                      <span className="block truncate">{p.email ?? "(sem e-mail)"}</span>
                      <span className="block text-xs text-text-muted">
                        {ROTULO_ESTADO[p.estado]}
                        {p.diasRestantes !== null &&
                          (p.diasRestantes >= 0 ? ` · ${p.diasRestantes} dia(s) restantes` : " · prazo vencido")}
                      </span>
                    </span>
                    {acoes?.(p, () => carregarPessoas(t.id))}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
