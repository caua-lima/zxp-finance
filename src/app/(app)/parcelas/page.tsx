"use client";

import { FormEvent, useMemo, useState } from "react";
import {
  formatarMoeda,
  formatarMes,
  mesPadrao,
  parcelasRestantesEm,
  diferencaMeses,
  mesSeguinte,
  Parcela,
  TipoParcela,
  VinculoDesejo,
  valorMinhaParte,
} from "@/lib/types";
import { useNomesCartoes } from "@/lib/useCartoesConfig";
import { useParcelas } from "@/lib/useParcelas";
import { useDesejosEmAberto } from "@/lib/useDesejosEmAberto";
import { resumoParcelasAtivas } from "@/lib/finance/resumoParcelas";
import { SeletorDesejo } from "@/components/SeletorDesejo";
import { MonthSelector } from "@/components/MonthSelector";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SkeletonLista } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { BotaoIcone, AcoesItem } from "@/components/BotaoIcone";
import { IconEditar, IconExcluir, IconEstornar } from "@/components/icons";

export default function ParcelasPage() {
  const {
    parcelas,
    loading,
    erro,
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
  const [desejoId, setDesejoId] = useState("");
  const desejos = useDesejosEmAberto();
  const toast = useToast();
  const nomesCartoes = useNomesCartoes();
  const [criando, setCriando] = useState(false);
  const resumo = resumoParcelasAtivas(parcelas, mesPadrao());

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nomeAparado = nome.trim();
    const vTotal = parseInt(totalParcelas, 10);
    if (!nomeAparado || !valorParcela || !vTotal) return;
    const vPagas = pagas ? Math.min(parseInt(pagas, 10), vTotal) : 0;
    const vRestantes = Math.max(0, vTotal - vPagas);
    setNome("");
    const desejo = desejos.itens.find((d) => d.id === desejoId);
    const vinculoDesejo: VinculoDesejo | undefined = desejo
      ? {
          taskId: desejo.id,
          nome: desejo.nome,
          precoCentavos: desejo.precoCentavos,
          vinculadoEm: Date.now(),
        }
      : undefined;
    setValorParcela(0);
    setTotalParcelas("");
    setPagas("");
    setDividida(false);
    setNaFatura(false);
    setDesejoId("");
    setCriando(false);
    toast.sucessoSe(adicionar(
      nomeAparado,
      valorParcela,
      vTotal,
      vRestantes,
      tipo,
      dividida,
      naFatura,
      cartao || undefined,
      mesInicio,
      vinculoDesejo
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

      {/* O que importa primeiro: quanto de parcela você tem DE FATO, somando
          também as que estão dentro da fatura do cartão. O total antigo
          deixava essas de fora e só mostrava o carro. */}
      <div className="mb-4 rounded-2xl border border-brand/25 bg-surface-elevated p-4">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">
          Parcelas ativas
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <p className="text-3xl font-bold tracking-tight text-gold">
            {formatarMoeda(resumo.mensalSuaParte)}
            <span className="text-sm font-medium text-text-faint">/mês</span>
          </p>
          <p className="text-sm text-text-muted">
            {resumo.quantidade} parcela{resumo.quantidade === 1 ? "" : "s"}
          </p>
        </div>
        {resumo.quantidade > 0 && (
          <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line-soft pt-3 text-xs">
            <div>
              <p className="text-text-faint">No cartão</p>
              <p className="font-medium">{formatarMoeda(resumo.mensalNoCartao)}/mês</p>
            </div>
            <div>
              <p className="text-text-faint">Fora do cartão</p>
              <p className="font-medium">{formatarMoeda(resumo.mensalForaDoCartao)}/mês</p>
            </div>
            <div>
              <p className="text-text-faint">Falta pagar no total</p>
              <p className="font-medium">{formatarMoeda(resumo.faltaPagar)}</p>
            </div>
            <div>
              <p className="text-text-faint">Livre de parcelas em</p>
              <p className="font-medium">
                {resumo.ultimoMes ? formatarMes(mesSeguinte(resumo.ultimoMes)) : "—"}
              </p>
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-text-faint">
          Valores na sua parte (metade quando é dividida).
        </p>
      </div>

      {!criando && (
        <Botao onClick={() => setCriando(true)} larguraTotal className="mb-4">
          + Nova parcela
        </Botao>
      )}

      {criando && (
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-brand/40 bg-surface p-4 mb-4 space-y-3"
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
              {nomesCartoes.map((c) => (
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

        <SeletorDesejo
          desejoId={desejoId}
          onSelecionar={setDesejoId}
          desejos={desejos}
        />

        <div className="flex gap-2">
          <Botao type="submit" larguraTotal>
            Adicionar parcela
          </Botao>
          <Botao onClick={() => setCriando(false)} variante="secundario" larguraTotal>
            Cancelar
          </Botao>
        </div>
      </form>
      )}

      <p className="text-xs text-text-faint mb-1 px-1">
        Navegue pelo mês pra ver o vencimento de cada parcela
      </p>
      <MonthSelector mes={mes} onChange={setMes} />

      {loading ? (
        <SkeletonLista linhas={4} />
      ) : parcelas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-text-faint">
          Nenhuma parcela cadastrada.
        </p>
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
          <p className="px-1 mb-1.5 text-xs font-medium uppercase tracking-wide text-text-faint">
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
  const nomesCartoes = useNomesCartoes();

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
            {nomesCartoes.map((c) => (
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
          {parcela.vinculoDesejo && (
            <p className="mt-0.5 text-xs text-brand">
              🎯 {parcela.vinculoDesejo.nome}
              {parcela.vinculoDesejo.precoCentavos !== null &&
                ` · ${formatarMoeda(parcela.vinculoDesejo.precoCentavos / 100)} no Tasks`}
            </p>
          )}
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
            className="inline-flex min-h-[44px] items-center px-2 -mx-2 text-xs text-brand hover:text-brand-dark"
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
