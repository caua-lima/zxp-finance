"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  formatarMoeda,
  formatarMes,
  mesPadrao,
  parcelasRestantesEm,
  Parcela,
  TipoParcela,
  valorMinhaParte,
} from "@/lib/types";
import { CARTOES_PREDEFINIDOS } from "@/lib/cartoes";
import { useParcelas } from "@/lib/useParcelas";
import { MonthSelector } from "@/components/MonthSelector";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";

export default function ParcelasPage() {
  const {
    parcelas,
    loading,
    erro,
    total,
    adicionar,
    editar,
    remover,
    darBaixa,
  } = useParcelas();

  const [mes, setMes] = useState(mesPadrao());
  const [nome, setNome] = useState("");
  const [valorParcela, setValorParcela] = useState(0);
  const [totalParcelas, setTotalParcelas] = useState("");
  const [pagas, setPagas] = useState("");
  const [tipo, setTipo] = useState<TipoParcela>("cartao");
  const [cartao, setCartao] = useState("");
  const [dividida, setDividida] = useState(false);
  const [naFatura, setNaFatura] = useState(false);
  const [mesInicio, setMesInicio] = useState(mesPadrao());

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nomeAparado = nome.trim();
    const vTotal = parseInt(totalParcelas, 10);
    if (!nomeAparado || !valorParcela || !vTotal) return;
    const vPagas = pagas ? Math.min(parseInt(pagas, 10), vTotal) : 0;
    const vRestantes = Math.max(0, vTotal - vPagas);
    setNome("");
    setValorParcela(0);
    setTotalParcelas("");
    setPagas("");
    setDividida(false);
    setNaFatura(false);
    adicionar(
      nomeAparado,
      valorParcela,
      vTotal,
      vRestantes,
      tipo,
      dividida,
      naFatura,
      cartao || undefined,
      mesInicio
    ).catch(console.error);
    setMesInicio(mesPadrao());
  }

  const grupos = useMemo(() => {
    const cartao = parcelas.filter((p) => p.tipo === "cartao" || !p.tipo);
    const financiamento = parcelas.filter((p) => p.tipo === "financiamento");
    return { cartao, financiamento };
  }, [parcelas]);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Parcelas</h1>
      <ErroBanner mensagem={erro} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-6 space-y-2"
      >
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTipo("cartao")}
            className={`rounded-full px-3 py-1 border transition-colors ${
              tipo === "cartao"
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-text-faint"
            }`}
          >
            Cartão de crédito
          </button>
          <button
            type="button"
            onClick={() => setTipo("financiamento")}
            className={`rounded-full px-3 py-1 border transition-colors ${
              tipo === "financiamento"
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-text-faint"
            }`}
          >
            Financiamento
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <input
            placeholder={
              tipo === "cartao" ? "Nome (ex: Notebook)" : "Nome (ex: Carro)"
            }
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="col-span-2 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <MoneyInput
            value={valorParcela}
            onChange={setValorParcela}
            placeholder="Valor parcela"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            placeholder="Total parcelas"
            inputMode="numeric"
            value={totalParcelas}
            onChange={(e) => setTotalParcelas(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <input
            placeholder="Já pagas"
            inputMode="numeric"
            value={pagas}
            onChange={(e) => setPagas(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
        </div>

        {tipo === "cartao" && (
          <select
            value={cartao}
            onChange={(e) => setCartao(e.target.value)}
            className="w-full sm:w-64 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">Qual cartão?</option>
            {CARTOES_PREDEFINIDOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={dividida}
            onChange={(e) => setDividida(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Dividida (você paga só a metade)
        </label>

        {tipo === "cartao" && (
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={naFatura}
              onChange={(e) => setNaFatura(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Já está na fatura do cartão (não contar de novo no total)
          </label>
        )}

        <div className="rounded-lg border border-line-soft bg-surface-2/50 px-3 py-2">
          <p className="text-xs text-text-muted mb-1.5">
            Mês da 1ª parcela que você vai pagar
          </p>
          <MonthSelector mes={mesInicio} onChange={setMesInicio} />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
        >
          Adicionar
        </button>
      </form>

      <div className="rounded-2xl border border-line bg-surface p-4 mb-4 flex justify-between items-center">
        <span className="text-sm text-text-muted">Total mensal em parcelas</span>
        <span className="text-lg font-semibold text-gold">
          {formatarMoeda(total)}
        </span>
      </div>

      <p className="text-xs text-text-faint mb-1 px-1">
        Navegue pelo mês pra ver o vencimento de cada parcela
      </p>
      <MonthSelector mes={mes} onChange={setMes} />

      {loading ? (
        <p className="text-sm text-text-faint">Carregando...</p>
      ) : parcelas.length === 0 ? (
        <p className="text-sm text-text-faint">Nenhuma parcela cadastrada.</p>
      ) : (
        <div className="space-y-5">
          <GrupoParcelas
            titulo="Cartão de crédito"
            itens={grupos.cartao}
            mes={mes}
            onEditar={editar}
            onRemover={remover}
            onDarBaixa={darBaixa}
          />
          <GrupoParcelas
            titulo="Financiamento"
            itens={grupos.financiamento}
            mes={mes}
            onEditar={editar}
            onRemover={remover}
            onDarBaixa={darBaixa}
          />
        </div>
      )}
    </div>
  );
}

interface DadosEdicaoParcela {
  nome: string;
  valorParcela: number;
  totalParcelas: number;
  parcelasRestantes: number;
  tipo: TipoParcela;
  dividida?: boolean;
  naFatura?: boolean;
  cartao?: string;
  mesReferencia?: string;
}

function GrupoParcelas({
  titulo,
  itens,
  mes,
  onEditar,
  onRemover,
  onDarBaixa,
}: {
  titulo: string;
  itens: Parcela[];
  mes: string;
  onEditar: (id: string, dados: DadosEdicaoParcela) => void;
  onRemover: (id: string, motivo: string) => void;
  onDarBaixa: (id: string) => void;
}) {
  if (itens.length === 0) return null;

  const ativas = itens.filter((p) => p.parcelasRestantes > 0);
  const quitadas = itens.filter((p) => p.parcelasRestantes === 0);

  const subtotal = ativas
    .filter((p) => !p.naFatura)
    .reduce((acc, p) => acc + valorMinhaParte(p), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-medium text-text-muted">{titulo}</h2>
        <span className="text-xs text-text-faint">
          {formatarMoeda(subtotal)}
        </span>
      </div>
      {ativas.length > 0 && (
        <ul className="space-y-2">
          {ativas.map((p) => (
            <ItemParcela
              key={p.id}
              parcela={p}
              mes={mes}
              onEditar={onEditar}
              onDarBaixa={onDarBaixa}
            />
          ))}
        </ul>
      )}
      {quitadas.length > 0 && (
        <div className="mt-3">
          <p className="px-1 mb-1.5 text-[11px] font-medium uppercase tracking-wide text-text-faint">
            Quitadas
          </p>
          <ul className="space-y-1.5">
            {quitadas.map((p) => (
              <ItemParcelaQuitada
                key={p.id}
                parcela={p}
                onEditar={onEditar}
                onRemover={onRemover}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ItemParcelaQuitada({
  parcela,
  onEditar,
  onRemover,
}: {
  parcela: Parcela;
  onEditar: (id: string, dados: DadosEdicaoParcela) => void;
  onRemover: (id: string, motivo: string) => void;
}) {
  const [confirmando, setConfirmando] = useState(false);

  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-line-soft bg-surface-2/40 px-4 py-2.5 opacity-60">
      <div className="min-w-0">
        <p className="text-sm text-text-faint truncate">{parcela.nome}</p>
        <p className="text-xs text-text-faint">
          {parcela.totalParcelas} de {parcela.totalParcelas} pagas
          {parcela.cartao ? ` · ${parcela.cartao}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <button
          onClick={() =>
            onEditar(parcela.id, {
              nome: parcela.nome,
              valorParcela: parcela.valorParcela,
              totalParcelas: parcela.totalParcelas,
              parcelasRestantes: 1,
              tipo: parcela.tipo,
              dividida: parcela.dividida,
              naFatura: parcela.naFatura,
              cartao: parcela.cartao,
              mesReferencia: mesPadrao(),
            })
          }
          className="text-xs text-text-faint hover:text-brand"
          title="Reabrir (voltar 1 parcela)"
        >
          reabrir
        </button>
        <button
          onClick={() => setConfirmando(true)}
          className="text-[10px] text-text-faint hover:text-negative whitespace-nowrap"
        >
          Excluir def.
        </button>
      </div>

      <ConfirmModal
        aberto={confirmando}
        titulo="Excluir definitivamente"
        descricao={`"${parcela.nome}" já está quitada e será apagada de vez — isso não pode ser desfeito.`}
        textoConfirmar="Excluir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          onRemover(parcela.id, motivo ?? "");
          setConfirmando(false);
        }}
        onCancelar={() => setConfirmando(false)}
      />
    </li>
  );
}

function ItemParcela({
  parcela,
  mes,
  onEditar,
  onDarBaixa,
}: {
  parcela: Parcela;
  mes: string;
  onEditar: (id: string, dados: DadosEdicaoParcela) => void;
  onDarBaixa: (id: string) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(parcela.nome);
  const [valorParcela, setValorParcela] = useState(parcela.valorParcela);
  const [totalParcelas, setTotalParcelas] = useState(
    String(parcela.totalParcelas)
  );
  const [pagas, setPagas] = useState(
    String(parcela.totalParcelas - parcela.parcelasRestantes)
  );
  const [tipo, setTipo] = useState<TipoParcela>(parcela.tipo ?? "cartao");
  const [cartao, setCartao] = useState(parcela.cartao ?? "");
  const [dividida, setDividida] = useState(!!parcela.dividida);
  const [naFatura, setNaFatura] = useState(!!parcela.naFatura);
  const [mesReferencia, setMesReferencia] = useState(
    parcela.mesReferencia ?? mesPadrao()
  );

  const restantesNoMes = parcelasRestantesEm(parcela, mes);
  const numeroNoMes = parcela.totalParcelas - restantesNoMes + 1;
  const ehMesAtual = mes === mesPadrao();

  function salvar() {
    const nomeAparado = nome.trim();
    const vTotal = parseInt(totalParcelas, 10);
    if (!nomeAparado || !valorParcela || !vTotal) return;
    const vPagas = pagas ? Math.min(parseInt(pagas, 10), vTotal) : 0;
    onEditar(parcela.id, {
      nome: nomeAparado,
      valorParcela,
      totalParcelas: vTotal,
      parcelasRestantes: Math.max(0, vTotal - vPagas),
      tipo,
      dividida,
      naFatura,
      cartao: cartao || undefined,
      mesReferencia,
    });
    setEditando(false);
  }

  if (editando) {
    return (
      <li className="rounded-xl border border-brand/40 bg-surface px-4 py-3 space-y-2">
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTipo("cartao")}
            className={`rounded-full px-3 py-1 border transition-colors ${
              tipo === "cartao"
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-text-faint"
            }`}
          >
            Cartão
          </button>
          <button
            type="button"
            onClick={() => setTipo("financiamento")}
            className={`rounded-full px-3 py-1 border transition-colors ${
              tipo === "financiamento"
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-text-faint"
            }`}
          >
            Financiamento
          </button>
        </div>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <div className="grid grid-cols-3 gap-2">
          <MoneyInput
            value={valorParcela}
            onChange={setValorParcela}
            placeholder="Valor parcela"
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <input
            placeholder="Total"
            inputMode="numeric"
            value={totalParcelas}
            onChange={(e) => setTotalParcelas(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <input
            placeholder="Já pagas"
            inputMode="numeric"
            value={pagas}
            onChange={(e) => setPagas(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
        </div>
        {tipo === "cartao" && (
          <select
            value={cartao}
            onChange={(e) => setCartao(e.target.value)}
            className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">Qual cartão?</option>
            {CARTOES_PREDEFINIDOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={dividida}
            onChange={(e) => setDividida(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Dividida (você paga só a metade)
        </label>
        {tipo === "cartao" && (
          <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer w-fit">
            <input
              type="checkbox"
              checked={naFatura}
              onChange={(e) => setNaFatura(e.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Já está na fatura do cartão (não contar de novo no total)
          </label>
        )}
        <div className="rounded-lg border border-line-soft bg-surface-2/50 px-3 py-2">
          <p className="text-xs text-text-muted mb-1.5">
            Mês em que &quot;faltam/pagas&quot; acima é válido
          </p>
          <MonthSelector mes={mesReferencia} onChange={setMesReferencia} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={salvar}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-[#0E0F0C]"
          >
            Salvar
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
      className={`rounded-xl border bg-surface px-4 py-3 ${
        parcela.parcelasRestantes > 0
          ? "border-line"
          : "border-line-soft opacity-50"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm">{parcela.nome}</p>
          <div className="flex flex-wrap gap-x-2 text-xs text-text-faint">
            {parcela.cartao && <span>💳 {parcela.cartao}</span>}
            {parcela.dividida && (
              <span>
                total {formatarMoeda(parcela.valorParcela)} · você paga
                metade
              </span>
            )}
            {parcela.naFatura && <span>já na fatura do cartão</span>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-sm font-medium ${
              parcela.naFatura ? "text-text-faint" : "text-gold"
            }`}
          >
            {formatarMoeda(valorMinhaParte(parcela))}
          </span>
          <button
            onClick={() => setEditando(true)}
            className="text-text-faint hover:text-brand text-sm"
            aria-label="Editar"
          >
            ✎
          </button>
        </div>
      </div>
      {/* linha do tempo */}
      <div className="flex gap-[3px] mt-2" aria-hidden="true">
        {Array.from({ length: parcela.totalParcelas }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${
              i < parcela.totalParcelas - parcela.parcelasRestantes
                ? "bg-positive"
                : "bg-surface-2"
            }`}
          />
        ))}
      </div>
      <p className="text-xs text-text-faint mt-1">
        Comprometido até quitar: {formatarMoeda(valorMinhaParte(parcela) * parcela.parcelasRestantes)}
      </p>
      <div className="flex items-center justify-between mt-2">
        <p className="text-xs text-text-faint">
          Faltam {parcela.parcelasRestantes} de {parcela.totalParcelas} ·{" "}
          {parcela.totalParcelas - parcela.parcelasRestantes} pagas
        </p>
        {parcela.parcelasRestantes > 0 && (
          <button
            onClick={() => onDarBaixa(parcela.id)}
            className="text-xs text-brand hover:text-brand-dark"
          >
            Dar baixa neste mês
          </button>
        )}
      </div>
      <p className="text-xs text-info mt-1">
        {ehMesAtual
          ? restantesNoMes > 0
            ? `este mês: parcela ${numeroNoMes} de ${parcela.totalParcelas}`
            : "quitada"
          : restantesNoMes > 0
          ? `previsão pra ${formatarMes(mes)}: parcela ${numeroNoMes} de ${parcela.totalParcelas} (se pagar 1 por mês)`
          : `previsão: já estaria quitada em ${formatarMes(mes)} — só confirmado quando você de fato pagar`}
      </p>
    </li>
  );
}
