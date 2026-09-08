"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  formatarMoeda,
  formatarMes,
  mesPadrao,
  parcelasRestantesEm,
  diferencaMeses,
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
import { SkeletonLista } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { BotaoIcone, AcoesItem } from "@/components/BotaoIcone";
import { IconEditar, IconExcluir, IconEstornar } from "@/components/icons";

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
  const toast = useToast();

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
    toast.sucessoSe(adicionar(
      nomeAparado,
      valorParcela,
      vTotal,
      vRestantes,
      tipo,
      dividida,
      naFatura,
      cartao || undefined,
      mesInicio
    ), `"${nomeAparado}" adicionada.`);
    setMesInicio(mesPadrao());
  }

  const grupos = useMemo(() => {
    const cartao = parcelas.filter((p) => p.tipo === "cartao" || !p.tipo);
    const financiamento = parcelas.filter((p) => p.tipo === "financiamento");
    return { cartao, financiamento };
  }, [parcelas]);

  return (
    <div>
      <PageHeader
        titulo="Parcelas"
        descricao="Compras parceladas e financiamentos em andamento"
      />
      <ErroBanner mensagem={erro} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-4 space-y-3"
      >
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setTipo("cartao")}
            className={`min-h-[42px] rounded-xl border text-xs font-medium transition-colors ${
              tipo === "cartao"
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-text-faint active:bg-surface-2"
            }`}
          >
            Cartão de crédito
          </button>
          <button
            type="button"
            onClick={() => setTipo("financiamento")}
            className={`min-h-[42px] rounded-xl border text-xs font-medium transition-colors ${
              tipo === "financiamento"
                ? "border-brand bg-brand-soft text-brand"
                : "border-line text-text-faint active:bg-surface-2"
            }`}
          >
            Financiamento
          </button>
        </div>

        <div>
          <label htmlFor="parcelas-form-nome" className="rotulo">
            Nome
          </label>
          <input
            id="parcelas-form-nome"
            placeholder={tipo === "cartao" ? "ex: Notebook" : "ex: Carro"}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo"
          />
        </div>

        <div>
          <label className="rotulo">Valor de cada parcela</label>
          <MoneyInput
            value={valorParcela}
            onChange={setValorParcela}
            className="campo"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="rotulo">Total de parcelas</label>
            <input
              placeholder="ex: 10"
              inputMode="numeric"
              value={totalParcelas}
              onChange={(e) => setTotalParcelas(e.target.value)}
              className="campo"
            />
          </div>
          <div>
            <label className="rotulo">Já pagas</label>
            <input
              placeholder="0"
              inputMode="numeric"
              value={pagas}
              onChange={(e) => setPagas(e.target.value)}
              className="campo"
            />
          </div>
        </div>

        {tipo === "cartao" && (
          <div>
            <label className="rotulo">Cartão</label>
            <select
              value={cartao}
              onChange={(e) => setCartao(e.target.value)}
              className="campo"
            >
              <option value="">Qual cartão?</option>
              {CARTOES_PREDEFINIDOS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface-2/60 px-3 py-2.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={dividida}
            onChange={(e) => setDividida(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-brand"
          />
          Dividida (você paga só a metade)
        </label>

        {tipo === "cartao" && (
          <label className="flex cursor-pointer items-center gap-2.5 rounded-xl bg-surface-2/60 px-3 py-2.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={naFatura}
              onChange={(e) => setNaFatura(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-brand"
            />
            Já está na fatura do cartão (não contar de novo)
          </label>
        )}

        <div className="rounded-xl border border-line-soft bg-surface-2/50 px-3 py-2.5">
          <p className="rotulo">Mês da 1ª parcela que você vai pagar</p>
          <MonthSelector mes={mesInicio} onChange={setMesInicio} />
        </div>

        <Botao type="submit" larguraTotal>
          Adicionar parcela
        </Botao>
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
        <SkeletonLista linhas={4} />
      ) : parcelas.length === 0 ? (
        <EmptyState
          mensagem="Nenhuma parcela cadastrada."
          alvoId="parcelas-form-nome"
        />
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
  onEditar: (id: string, dados: DadosEdicaoParcela) => Promise<boolean>;
  onRemover: (id: string, motivo: string) => Promise<boolean>;
  onDarBaixa: (id: string) => Promise<boolean>;
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
  onEditar: (id: string, dados: DadosEdicaoParcela) => Promise<boolean>;
  onRemover: (id: string, motivo: string) => Promise<boolean>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const toast = useToast();

  return (
    <li className="flex items-center justify-between gap-2 rounded-xl border border-line-soft bg-surface-2/40 px-4 py-2.5 opacity-60">
      <div className="min-w-0">
        <p className="text-sm text-text-faint truncate">{parcela.nome}</p>
        <p className="text-xs text-text-faint">
          {parcela.totalParcelas} de {parcela.totalParcelas} pagas
          {parcela.cartao ? ` · ${parcela.cartao}` : ""}
        </p>
      </div>
      <AcoesItem>
        <BotaoIcone
          label="Reabrir (voltar 1 parcela)"
          onClick={() => {
            toast.sucessoSe(onEditar(parcela.id, {
              nome: parcela.nome,
              valorParcela: parcela.valorParcela,
              totalParcelas: parcela.totalParcelas,
              parcelasRestantes: 1,
              tipo: parcela.tipo,
              dividida: parcela.dividida,
              naFatura: parcela.naFatura,
              cartao: parcela.cartao,
              mesReferencia: mesPadrao(),
            }), `"${parcela.nome}" reaberta.`);
          }}
        >
          <IconEstornar width={17} height={17} />
        </BotaoIcone>
        <BotaoIcone
          label="Excluir definitivamente"
          tom="perigo"
          onClick={() => setConfirmando(true)}
        >
          <IconExcluir width={17} height={17} />
        </BotaoIcone>
      </AcoesItem>

      <ConfirmModal
        aberto={confirmando}
        titulo="Excluir definitivamente"
        descricao={`"${parcela.nome}" já está quitada e será apagada de vez — isso não pode ser desfeito.`}
        textoConfirmar="Excluir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          toast.sucessoSe(onRemover(parcela.id, motivo ?? ""), "Parcela excluída.");
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
  onEditar: (id: string, dados: DadosEdicaoParcela) => Promise<boolean>;
  onDarBaixa: (id: string) => Promise<boolean>;
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
  const toast = useToast();

  const referencia = parcela.mesReferencia ?? mesPadrao();
  // decorridos < 0 cobre dois casos que parecem iguais de fora (0 parcelas
  // pra esse mês) mas são coisas diferentes: a parcela ainda não começou,
  // ou já foi dada baixa até aqui e a próxima só cai no mês seguinte —
  // os dois casos mostram "próxima parcela em X" em vez de "parcela 1"/"quitada".
  const decorridos = diferencaMeses(referencia, mes);
  const restantesNoMes = parcelasRestantesEm(parcela, mes);
  const numeroNoMes = parcela.totalParcelas - restantesNoMes + 1;
  const ehMesAtual = mes === mesPadrao();

  function salvar() {
    const nomeAparado = nome.trim();
    const vTotal = parseInt(totalParcelas, 10);
    if (!nomeAparado || !valorParcela || !vTotal) return;
    const vPagas = pagas ? Math.min(parseInt(pagas, 10), vTotal) : 0;
    toast.sucessoSe(
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
      }),
      "Parcela atualizada."
    );
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
          className="campo"
        />
        <div className="grid grid-cols-3 gap-2">
          <MoneyInput
            value={valorParcela}
            onChange={setValorParcela}
            placeholder="Valor parcela"
            className="campo"
          />
          <input
            placeholder="Total"
            inputMode="numeric"
            value={totalParcelas}
            onChange={(e) => setTotalParcelas(e.target.value)}
            className="campo"
          />
          <input
            placeholder="Já pagas"
            inputMode="numeric"
            value={pagas}
            onChange={(e) => setPagas(e.target.value)}
            className="campo"
          />
        </div>
        {tipo === "cartao" && (
          <select
            value={cartao}
            onChange={(e) => setCartao(e.target.value)}
            className="campo"
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
            className="min-h-[44px] flex-1 rounded-xl bg-brand px-3 text-sm font-semibold text-on-brand"
          >
            Salvar
          </button>
          <button
            onClick={() => setEditando(false)}
            className="min-h-[44px] flex-1 rounded-xl border border-line px-3 text-sm font-medium text-text-muted"
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
          <BotaoIcone label="Editar parcela" onClick={() => setEditando(true)}>
            <IconEditar width={17} height={17} />
          </BotaoIcone>
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
        {parcela.parcelasRestantes > 0 && decorridos >= 0 && (
          <button
            onClick={() => {
              toast.sucessoSe(onDarBaixa(parcela.id), `Baixa dada em "${parcela.nome}".`);
            }}
            className="text-xs text-brand hover:text-brand-dark"
          >
            Dar baixa neste mês
          </button>
        )}
      </div>
      <p className="text-xs text-info mt-1">
        {decorridos < 0
          ? `próxima parcela em ${formatarMes(referencia)}`
          : ehMesAtual
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
