"use client";

import { FormEvent, useRef, useState, useEffect } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useParcelas } from "@/lib/useParcelas";
import { useDesejosEmAberto } from "@/lib/useDesejosEmAberto";
import { SeletorDesejo } from "@/components/SeletorDesejo";
import { formatarMoeda, mesPadrao, VinculoDesejo, TipoParcela } from "@/lib/types";
import { CARTOES_PREDEFINIDOS } from "@/lib/cartoes";
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { useToast } from "@/components/Toast";
import type { ResultadoSimulacao } from "@/lib/finance/simulador";

interface EntradaSimulacao {
  valorMensal: number;
  meses: number;
}

interface Troca {
  id: number;
  pergunta: string;
  resposta: string | null;
  erro: string | null;
  ferramentaExecutada: boolean;
  simulacao: ResultadoSimulacao | null;
  entradaSimulacao: EntradaSimulacao | null;
  parcelaCriada: boolean;
}

const SUGESTOES = [
  "Dá pra eu assumir uma parcela de 200 em 12x?",
  "Consigo financiar 3500 em 10 vezes de 350?",
  "Dá pra comprar algo de 1200 parcelado em 6x de 200?",
];

// contador simples, não Date.now() — id só precisa ser único nesta lista,
// e Date.now() dentro de uma função chamada em render é impuro (regra do
// React Compiler), mesmo mais simples de mirar aqui igual chat/page.tsx
let proximaTrocaId = 1;

/**
 * Chat de viabilidade financeira — a ponte com o ZXP Tasks entra aqui
 * quando a simulação é viável e a pessoa quer criar a parcela já vinculada
 * a um item da lista de desejos. Pergunta → ferramenta real
 * (simularNovoCompromisso, ver src/lib/finance/simulador.ts) → resposta.
 * O modelo nunca decide o número; ele só traduz o resultado real pra
 * português (ver src/app/api/consultor/route.ts).
 *
 * Criar a parcela é sempre uma ação explícita da pessoa — clicar em
 * "Criar parcela" depois de ver a simulação — nunca uma consequência
 * automática da resposta do chat.
 */
export default function ConsultorPage() {
  const { user } = useAuth();
  const { adicionar } = useParcelas();
  const desejos = useDesejosEmAberto();
  const toast = useToast();

  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [trocas, setTrocas] = useState<Troca[]>([]);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [trocas]);

  async function enviar(pergunta: string) {
    if (!user || enviando) return;
    const id = proximaTrocaId++;
    setTrocas((atual) => [
      ...atual,
      {
        id,
        pergunta,
        resposta: null,
        erro: null,
        ferramentaExecutada: false,
        simulacao: null,
        entradaSimulacao: null,
        parcelaCriada: false,
      },
    ]);
    setEnviando(true);
    try {
      const token = await user.getIdToken();
      const resposta = await fetch("/api/consultor", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pergunta }),
      });
      const dados = await resposta.json();
      setTrocas((atual) =>
        atual.map((t) =>
          t.id === id
            ? resposta.ok
              ? {
                  ...t,
                  resposta: dados.resposta as string,
                  ferramentaExecutada: !!dados.ferramentaExecutada,
                  simulacao: dados.simulacao as ResultadoSimulacao | null,
                  entradaSimulacao: dados.entradaSimulacao as EntradaSimulacao | null,
                }
              : { ...t, erro: (dados.erro as string) ?? "Erro ao consultar." }
            : t
        )
      );
    } catch {
      setTrocas((atual) =>
        atual.map((t) => (t.id === id ? { ...t, erro: "Não consegui falar com o consultor agora." } : t))
      );
    } finally {
      setEnviando(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta) return;
    setTexto("");
    enviar(pergunta);
  }

  function marcarParcelaCriada(id: number) {
    setTrocas((atual) => atual.map((t) => (t.id === id ? { ...t, parcelaCriada: true } : t)));
  }

  return (
    <div className="flex min-h-[calc(100vh-13rem)] flex-col">
      <PageHeader
        titulo="Consultor"
        descricao="Pergunte se dá pra assumir um novo compromisso — a resposta usa seus números reais"
      />

      {trocas.length === 0 && (
        <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
          <p className="text-sm text-text-muted mb-2">
            Pergunte algo como:
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                onClick={() => enviar(s)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-text-muted hover:border-brand/40 hover:text-text"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto pb-3">
        {trocas.map((t) => (
          <div key={t.id}>
            <div className="flex justify-end mb-1.5">
              <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-soft px-4 py-2.5 text-sm text-text">
                {t.pergunta}
              </p>
            </div>
            {t.erro ? (
              <div className="rounded-2xl border border-negative/30 bg-negative-soft px-4 py-3 text-sm text-negative">
                {t.erro}
              </div>
            ) : t.resposta === null ? (
              <div className="rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-text-faint italic">
                Calculando com seus números...
              </div>
            ) : (
              <RespostaConsultor
                troca={t}
                onCriarParcela={() => marcarParcelaCriada(t.id)}
                adicionar={adicionar}
                desejos={desejos}
                toast={toast}
              />
            )}
          </div>
        ))}
        <div ref={fimRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 border-t border-line pt-3">
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Dá pra eu assumir uma parcela de..."
          className="campo flex-1"
          disabled={enviando}
        />
        <Botao type="submit" disabled={enviando || !texto.trim()}>
          Enviar
        </Botao>
      </form>
    </div>
  );
}

function RespostaConsultor({
  troca,
  onCriarParcela,
  adicionar,
  desejos,
  toast,
}: {
  troca: Troca;
  onCriarParcela: () => void;
  adicionar: ReturnType<typeof useParcelas>["adicionar"];
  desejos: ReturnType<typeof useDesejosEmAberto>;
  toast: ReturnType<typeof useToast>;
}) {
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoParcela>("financiamento");
  const [cartao, setCartao] = useState("");
  const [desejoId, setDesejoId] = useState("");

  const viavel = troca.simulacao?.viavel ?? false;
  const podeOferecerCriacao = viavel && troca.entradaSimulacao && !troca.parcelaCriada;

  async function confirmarCriacao() {
    if (!troca.entradaSimulacao) return;
    const nomeAparado = nome.trim() || "Compromisso do consultor";
    const desejo = desejos.itens.find((d) => d.id === desejoId);
    const vinculoDesejo: VinculoDesejo | undefined = desejo
      ? {
          taskId: desejo.id,
          nome: desejo.nome,
          precoCentavos: desejo.precoCentavos,
          vinculadoEm: Date.now(),
        }
      : undefined;

    const ok = await adicionar(
      nomeAparado,
      troca.entradaSimulacao.valorMensal,
      troca.entradaSimulacao.meses,
      troca.entradaSimulacao.meses,
      tipo,
      false,
      false,
      tipo === "cartao" ? cartao || undefined : undefined,
      mesPadrao(),
      vinculoDesejo
    );
    if (ok) {
      toast.sucesso(`"${nomeAparado}" criada em Parcelas.`);
      onCriarParcela();
      setCriando(false);
    } else {
      toast.erro("Não consegui criar a parcela agora.");
    }
  }

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm ${
        troca.ferramentaExecutada === false
          ? "border-line bg-surface"
          : viavel
          ? "border-positive/30 bg-positive-soft/40"
          : "border-negative/30 bg-negative-soft"
      }`}
    >
      <p className={viavel ? "text-text" : "text-text"}>{troca.resposta}</p>

      {troca.simulacao && (
        <p className="mt-2 text-xs text-text-faint">
          Simulação: {formatarMoeda(troca.entradaSimulacao?.valorMensal ?? 0)}/mês por{" "}
          {troca.entradaSimulacao?.meses}x · saldo final projetado{" "}
          {formatarMoeda(troca.simulacao.meses[troca.simulacao.meses.length - 1]?.saldoFinal ?? 0)}
        </p>
      )}

      {podeOferecerCriacao && !criando && (
        <button
          onClick={() => {
            setCriando(true);
            if (!desejos.carregou) desejos.buscar();
          }}
          className="mt-3 text-xs font-semibold text-brand hover:text-brand-dark"
        >
          Criar essa parcela
        </button>
      )}

      {troca.parcelaCriada && (
        <p className="mt-2 text-xs text-brand">✓ Parcela criada em Parcelas.</p>
      )}

      {criando && (
        <div className="mt-3 space-y-2 rounded-xl border border-line-soft bg-surface-2/50 p-3">
          <input
            placeholder="Nome (ex: Multimídia do carro)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo"
          />
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setTipo("financiamento")}
              className={`min-h-[38px] flex-1 rounded-xl border text-xs font-medium transition-colors ${
                tipo === "financiamento"
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line text-text-faint"
              }`}
            >
              Financiamento
            </button>
            <button
              type="button"
              onClick={() => setTipo("cartao")}
              className={`min-h-[38px] flex-1 rounded-xl border text-xs font-medium transition-colors ${
                tipo === "cartao"
                  ? "border-brand bg-brand-soft text-brand"
                  : "border-line text-text-faint"
              }`}
            >
              Cartão
            </button>
          </div>
          {tipo === "cartao" && (
            <select value={cartao} onChange={(e) => setCartao(e.target.value)} className="campo">
              <option value="">Qual cartão?</option>
              {CARTOES_PREDEFINIDOS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <SeletorDesejo desejoId={desejoId} onSelecionar={setDesejoId} desejos={desejos} />
          <div className="flex gap-2 pt-1">
            <Botao onClick={confirmarCriacao} tamanho="pequeno">
              Confirmar e criar
            </Botao>
            <Botao onClick={() => setCriando(false)} variante="secundario" tamanho="pequeno">
              Cancelar
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
