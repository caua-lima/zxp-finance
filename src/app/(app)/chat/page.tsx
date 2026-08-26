"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { formatarMoeda } from "@/lib/types";
import {
  CATEGORIAS_GASTO,
  iconeCategoriaGasto,
  inferirCategoriaGasto,
} from "@/lib/categoriasGasto";
import { parseGastoTexto } from "@/lib/parseGastoTexto";
import { useReconhecimentoVoz } from "@/lib/useReconhecimentoVoz";
import { useSaldo } from "@/lib/useSaldo";
import { useGastos } from "@/lib/useGastos";
import {
  diasRestantesNoMes,
  calculateGastavelPorDia,
  calculateGastoDoDia,
  hojeISO,
} from "@/lib/finance/calculations";
import { PageHeader } from "@/components/PageHeader";
import { ErroBanner } from "@/components/ErroBanner";
import { Botao } from "@/components/Botao";
import { IconMicrofone } from "@/components/icons";

type Mensagem =
  | { tipo: "voce"; texto: string; id: number }
  | { tipo: "app"; texto: string; id: number }
  | {
      tipo: "confirmar";
      id: number;
      valor: number;
      descricao: string;
      categoria: string;
    }
  | {
      tipo: "salvo";
      id: number;
      valor: number;
      descricao: string;
      categoria: string;
      restante: number | null;
    };

/**
 * Omit sobre união precisa distribuir: `Omit<Mensagem, "id">` direto colapsa
 * as variantes e o TypeScript passa a rejeitar os campos de cada uma.
 */
type SemId<T> = T extends unknown ? Omit<T, "id"> : never;

let proximoId = 1;

export default function ChatPage() {
  const { saldo } = useSaldo();
  const { gastos, adicionar, erro } = useGastos();
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState("");
  const fimRef = useRef<HTMLDivElement>(null);

  const hoje = hojeISO();

  const gastosDesdeReferencia = saldo
    ? gastos.filter((g) => g.criadoEm > saldo.atualizadoEm)
    : [];
  const saldoAtual = saldo
    ? saldo.valor - gastosDesdeReferencia.reduce((acc, g) => acc + g.valor, 0)
    : null;
  const gastavelPorDia = calculateGastavelPorDia(
    saldoAtual,
    saldo?.reservaMeta ?? 0,
    diasRestantesNoMes(hoje)
  );
  const aindaHoje =
    gastavelPorDia === null ? null : gastavelPorDia - calculateGastoDoDia(gastos, hoje);

  function adicionarMensagem(m: SemId<Mensagem>) {
    setMensagens((atual) => [...atual, { ...m, id: proximoId++ } as Mensagem]);
  }

  /** Recebe uma frase (falada ou digitada) e devolve a interpretação. */
  function interpretar(frase: string) {
    const limpa = frase.trim();
    if (!limpa) return;
    adicionarMensagem({ tipo: "voce", texto: limpa });

    const { valor, descricao } = parseGastoTexto(limpa);

    if (!valor || !descricao) {
      adicionarMensagem({
        tipo: "app",
        texto: !valor
          ? "Não achei o valor nessa frase. Tenta algo como “gastei 30 no mercado”."
          : "Entendi o valor, mas não o que foi. Tenta “gastei 30 no mercado”.",
      });
      return;
    }

    adicionarMensagem({
      tipo: "confirmar",
      valor,
      descricao,
      categoria: inferirCategoriaGasto(descricao),
    });
  }

  const voz = useReconhecimentoVoz(interpretar);

  function confirmar(m: Extract<Mensagem, { tipo: "confirmar" }>, categoria: string) {
    adicionar(m.descricao, m.valor, categoria).catch(console.error);
    // O saldo do Firestore só chega no próximo snapshot; o desconto aqui é
    // otimista pra a resposta ser imediata, e o valor real reaparece sozinho.
    const restante = aindaHoje === null ? null : aindaHoje - m.valor;
    setMensagens((atual) =>
      atual.map((x) =>
        x.id === m.id
          ? {
              tipo: "salvo",
              id: m.id,
              valor: m.valor,
              descricao: m.descricao,
              categoria,
              restante,
            }
          : x
      )
    );
  }

  function descartar(id: number) {
    setMensagens((atual) => atual.filter((x) => x.id !== id));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    interpretar(texto);
    setTexto("");
  }

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [mensagens, voz.parcial]);

  return (
    <div className="flex min-h-[calc(100vh-13rem)] flex-col">
      <PageHeader
        titulo="Anotar gasto"
        descricao="Fale ou escreva do seu jeito — eu separo valor e categoria"
      />
      <ErroBanner mensagem={erro || voz.erro} />

      {/* quanto ainda dá pra gastar, sempre visível */}
      {aindaHoje !== null && (
        <div className="mb-4 flex items-center justify-between rounded-2xl border border-brand/25 bg-surface-elevated px-4 py-3">
          <span className="text-xs text-text-faint">Ainda posso gastar hoje</span>
          <span
            className={`text-lg font-bold ${
              aindaHoje >= 0 ? "text-brand" : "text-negative"
            }`}
          >
            {formatarMoeda(aindaHoje)}
          </span>
        </div>
      )}

      {/* conversa */}
      <div className="flex-1 space-y-3">
        {mensagens.length === 0 && (
          <div className="rounded-2xl border border-dashed border-line px-4 py-6 text-center">
            <p className="text-sm text-text-muted">
              {voz.suportado
                ? "Toque no microfone e diga o que gastou."
                : "Escreva o que gastou no campo abaixo."}
            </p>
            <p className="mt-2 text-xs text-text-faint">
              Ex: “acabei de gastar 3 reais em paieiro”
            </p>
          </div>
        )}

        {mensagens.map((m) => {
          if (m.tipo === "voce") {
            return (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-brand px-4 py-2.5 text-sm text-[#10100E]">
                  {m.texto}
                </p>
              </div>
            );
          }

          if (m.tipo === "app") {
            return (
              <div key={m.id} className="flex justify-start">
                <p className="max-w-[85%] rounded-2xl rounded-bl-md border border-line bg-surface px-4 py-2.5 text-sm text-text-muted">
                  {m.texto}
                </p>
              </div>
            );
          }

          if (m.tipo === "confirmar") {
            return (
              <div key={m.id} className="rounded-2xl border border-line bg-surface p-4">
                <p className="text-xs text-text-faint">Entendi assim:</p>
                <p className="mt-1 text-2xl font-bold text-gold">
                  {formatarMoeda(m.valor)}
                </p>
                <p className="text-sm text-text">{m.descricao}</p>

                <p className="rotulo mt-3">Categoria</p>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORIAS_GASTO.map((c) => (
                    <button
                      key={c}
                      onClick={() =>
                        setMensagens((atual) =>
                          atual.map((x) =>
                            x.id === m.id && x.tipo === "confirmar"
                              ? { ...x, categoria: c }
                              : x
                          )
                        )
                      }
                      className={`min-h-[36px] rounded-full border px-3 text-xs font-medium transition-colors ${
                        m.categoria === c
                          ? "border-brand bg-brand-soft text-brand"
                          : "border-line text-text-faint active:bg-surface-2"
                      }`}
                    >
                      {iconeCategoriaGasto(c)} {c}
                    </button>
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <Botao onClick={() => confirmar(m, m.categoria)} larguraTotal>
                    Confirmar
                  </Botao>
                  <Botao
                    onClick={() => descartar(m.id)}
                    variante="secundario"
                    larguraTotal
                  >
                    Descartar
                  </Botao>
                </div>
              </div>
            );
          }

          return (
            <div
              key={m.id}
              className="rounded-2xl border border-positive/30 bg-positive-soft/40 px-4 py-3"
            >
              <p className="text-sm font-semibold text-positive">
                ✓ {formatarMoeda(m.valor)} · {m.descricao}
              </p>
              <p className="mt-0.5 text-xs text-text-faint">
                {iconeCategoriaGasto(m.categoria)} {m.categoria}
                {m.restante !== null &&
                  ` · ainda pode gastar ${formatarMoeda(m.restante)} hoje`}
              </p>
            </div>
          );
        })}

        {voz.parcial && (
          <div className="flex justify-end">
            <p className="max-w-[85%] rounded-2xl rounded-br-md border border-brand/40 px-4 py-2.5 text-sm italic text-text-faint">
              {voz.parcial}…
            </p>
          </div>
        )}
        <div ref={fimRef} />
      </div>

      {/* barra de entrada, colada acima da tab bar */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 -mx-4 mt-4 border-t border-line bg-bg/95 px-4 py-3 backdrop-blur"
      >
        <div className="flex items-center gap-2">
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Gastei 30 no mercado"
            aria-label="Descreva o gasto"
            className="campo flex-1"
          />
          {voz.suportado ? (
            <button
              type="button"
              onClick={voz.ouvindo ? voz.parar : voz.ouvir}
              aria-label={voz.ouvindo ? "Parar de ouvir" : "Falar o gasto"}
              className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border transition-colors ${
                voz.ouvindo
                  ? "animate-pulse border-negative bg-negative text-white"
                  : "border-line bg-surface text-text-muted active:bg-surface-2"
              }`}
            >
              <IconMicrofone width={20} height={20} />
            </button>
          ) : null}
          <Botao type="submit" disabled={!texto.trim()} className="shrink-0">
            Enviar
          </Botao>
        </div>
        {voz.ouvindo && (
          <p className="mt-1.5 text-center text-[11px] text-negative">
            Ouvindo… fale o que gastou
          </p>
        )}
        {!voz.suportado && (
          <p className="mt-1.5 text-[11px] text-text-faint">
            Seu navegador não tem reconhecimento de voz — dá pra escrever
            normalmente. No celular, Chrome e Safari costumam ter.
          </p>
        )}
      </form>
    </div>
  );
}
