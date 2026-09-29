"use client";

import { useState } from "react";
import { mesPadrao, formatarMoeda, FaturaCartao } from "@/lib/types";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { useCartoesConfig, CartaoConfig } from "@/lib/useCartoesConfig";
import { useMonthClose } from "@/lib/useMonthClose";
import { useParcelas } from "@/lib/useParcelas";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { usePagamentos } from "@/lib/usePagamentos";
import { MonthSelector } from "@/components/MonthSelector";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { SkeletonLista } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { ConfirmModal } from "@/components/ConfirmModal";
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { BotaoIcone } from "@/components/BotaoIcone";
import { IconExcluir } from "@/components/icons";
import { hojeISO } from "@/lib/finance/calculations";
import { diasAteVencimento } from "@/lib/finance/vencimentoFatura";
import { vencimentoEfetivo } from "@/lib/finance/diasUteis";
import {
  composicaoFaturaPrevista,
  devePreverFatura,
  FaturaPrevista,
} from "@/lib/finance/faturaPrevista";

export default function FaturaPage() {
  const [mes, setMes] = useState(mesPadrao());
  const { faturas, loading, erro, total, salvar, excluir } = useFaturasCartao(mes);
  const cartoesConfig = useCartoesConfig();
  const monthClose = useMonthClose(mes);
  const parcelas = useParcelas();
  const assinaturas = useAssinaturas();
  const pagamentos = usePagamentos(mes);
  const hoje = hojeISO();

  const cartoes = faturas.map((f) => {
    const config = cartoesConfig.configs.find((c) => c.nome === f.nome) ?? { nome: f.nome };
    const prevista =
      f.valor > 0 || !devePreverFatura(mes, hoje, config.diaVencimento)
        ? null
        : composicaoFaturaPrevista(f.nome, mes, parcelas.parcelas, assinaturas.assinaturas);
    return {
      fatura: f,
      config,
      prevista: prevista && prevista.total > 0 ? prevista : null,
      pago: pagamentos.estaPago("fatura", f.id),
    };
  });
  // cartão sem nada no mês (sem fatura, sem previsão e sem dia de
  // vencimento) só ocupa espaço — fica recolhido no fim
  const emUso = cartoes.filter((c) => c.fatura.valor > 0 || c.prevista || c.config.diaVencimento);
  const semUso = cartoes.filter((c) => !emUso.includes(c));
  const totalPrevisto = cartoes.reduce((acc, c) => acc + (c.prevista?.total ?? 0), 0);

  function renderizar(c: (typeof cartoes)[number]) {
    return (
      <ItemFatura
        key={`${mes}-${c.fatura.nome}`}
        fatura={c.fatura}
        config={c.config}
        prevista={c.prevista}
        pago={c.pago}
        mes={mes}
        onSalvar={salvar}
        onExcluir={excluir}
        onSalvarConfig={cartoesConfig.salvar}
        bloqueado={monthClose.fechado}
      />
    );
  }

  return (
    <div>
      <PageHeader titulo="Fatura do cartão" descricao="Valor e vencimento de cada cartão no mês" />
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={erro || cartoesConfig.erro || monthClose.erro || pagamentos.erro} />
      {monthClose.fechado && (
        <div className="mb-4 rounded-xl border border-line-soft bg-surface-2/50 px-4 py-3 text-xs text-text-faint">
          🔒 Mês fechado — lançar fatura fica bloqueado. Reabra na aba DRE pra corrigir algo.
        </div>
      )}

      <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">Faturas lançadas</span>
          <span className="text-lg font-semibold text-gold">{formatarMoeda(total)}</span>
        </div>
        {totalPrevisto > 0 && (
          <div className="mt-2 flex items-center justify-between border-t border-line-soft pt-2">
            <span className="text-xs text-text-faint">+ previstas (ainda não lançadas)</span>
            <span className="text-sm font-medium text-text-muted">
              {formatarMoeda(totalPrevisto)}
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <SkeletonLista linhas={3} />
      ) : (
        <>
          <ul className="space-y-3">{emUso.map(renderizar)}</ul>
          {semUso.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer px-1 text-xs text-text-faint">
                Outros cartões ({semUso.length})
              </summary>
              <ul className="mt-2 space-y-3">{semUso.map(renderizar)}</ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}

function ItemFatura({
  fatura,
  config,
  prevista,
  pago,
  mes,
  onSalvar,
  onExcluir,
  onSalvarConfig,
  bloqueado,
}: {
  fatura: FaturaCartao;
  config: CartaoConfig;
  prevista: FaturaPrevista | null;
  pago: boolean;
  mes: string;
  onSalvar: (cartao: string, valor: number) => Promise<boolean>;
  onExcluir: (cartao: string) => Promise<boolean>;
  onSalvarConfig: (
    cartao: string,
    dados: { limite?: number; diaFechamento?: number; diaVencimento?: number }
  ) => Promise<boolean>;
  bloqueado?: boolean;
}) {
  const [valor, setValor] = useState(fatura.valor);
  const alterado = valor !== fatura.valor;
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [limite, setLimite] = useState(config.limite ?? 0);
  const [diaFechamento, setDiaFechamento] = useState(
    config.diaFechamento ? String(config.diaFechamento) : ""
  );
  const [diaVencimento, setDiaVencimento] = useState(
    config.diaVencimento ? String(config.diaVencimento) : ""
  );
  const toast = useToast();

  const valorDoMes = fatura.valor > 0 ? fatura.valor : prevista?.total ?? 0;
  const percentualUsado = config.limite ? (valorDoMes / config.limite) * 100 : null;
  const diasRestantes = config.diaVencimento
    ? diasAteVencimento(config.diaVencimento, mes, hojeISO())
    : null;
  // caindo em fim de semana ou feriado, a data real é outra
  const vencimento = config.diaVencimento ? vencimentoEfetivo(config.diaVencimento, mes) : null;

  function salvarConfig() {
    toast.sucessoSe(
      onSalvarConfig(fatura.nome, {
        limite: limite || undefined,
        diaFechamento: diaFechamento ? parseInt(diaFechamento, 10) : undefined,
        diaVencimento: diaVencimento ? parseInt(diaVencimento, 10) : undefined,
      }),
      `Configuração de "${fatura.nome}" salva.`
    );
    setEditandoConfig(false);
  }

  // Situação do vencimento: fatura paga no checklist nunca mais aparece
  // como "venceu há X dias" — era isso que acusava o Nubank de atrasado.
  let situacao: { texto: string; cor: string } | null = null;
  if (pago) situacao = { texto: "✓ paga", cor: "text-positive" };
  else if (diasRestantes !== null && valorDoMes > 0)
    situacao =
      diasRestantes < 0
        ? { texto: `venceu há ${Math.abs(diasRestantes)} dia(s)`, cor: "text-negative" }
        : diasRestantes === 0
        ? { texto: "vence hoje", cor: "text-gold" }
        : diasRestantes === 1
        ? { texto: "vence amanhã", cor: "text-gold" }
        : { texto: `em ${diasRestantes} dias`, cor: diasRestantes <= 5 ? "text-gold" : "text-text-faint" };

  return (
    <li
      className={`rounded-2xl border bg-surface px-4 py-3 ${
        pago ? "border-positive/25" : "border-line"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">💳 {fatura.nome}</p>
        {situacao && <span className={`shrink-0 text-xs font-medium ${situacao.cor}`}>{situacao.texto}</span>}
      </div>

      {vencimento && (
        <p className="mt-0.5 text-[11px] text-text-faint">
          Vence dia {Number(vencimento.efetivo.split("-")[2])}
          {vencimento.adiado && ` (${vencimento.motivo})`}
          {config.diaFechamento ? ` · fecha dia ${config.diaFechamento}` : ""}
        </p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        <MoneyInput value={valor} onChange={setValor} className="campo flex-1 text-right font-semibold" />
        <Botao
          onClick={() => {
            toast.sucessoSe(onSalvar(fatura.nome, valor), `Fatura de "${fatura.nome}" atualizada.`);
          }}
          disabled={!alterado || bloqueado}
          className="shrink-0"
        >
          Salvar
        </Botao>
        {fatura.valor > 0 && (
          <BotaoIcone
            label="Excluir fatura"
            tom="perigo"
            onClick={() => setConfirmandoExclusao(true)}
            disabled={bloqueado}
          >
            <IconExcluir width={17} height={17} />
          </BotaoIcone>
        )}
      </div>

      {prevista && (
        <div className="mt-2 rounded-xl bg-surface-2/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-text-muted">
              Prevista: <strong className="text-text">{formatarMoeda(prevista.total)}</strong>
            </span>
            <button
              onClick={() => setValor(prevista.total)}
              disabled={bloqueado}
              className="text-xs font-medium text-brand disabled:opacity-40"
            >
              usar esse valor
            </button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-text-faint">
            {prevista.itens.map((i) => `${i.nome} ${formatarMoeda(i.valor)}`).join(" · ")}
          </p>
        </div>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-faint">
        {config.limite ? (
          <span className={percentualUsado! >= 80 ? "text-negative" : ""}>
            {percentualUsado!.toFixed(0)}% do limite ({formatarMoeda(config.limite)})
          </span>
        ) : null}
        <button
          onClick={() => setEditandoConfig((v) => !v)}
          className="text-brand hover:text-brand-dark"
        >
          {editandoConfig
            ? "fechar"
            : config.diaVencimento
            ? "configurar cartão"
            : "+ dia de vencimento (pra avisar no celular)"}
        </button>
      </div>

      {editandoConfig && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <div>
            <label className="rotulo">Limite</label>
            <MoneyInput value={limite} onChange={setLimite} className="campo" />
          </div>
          <div>
            <label className="rotulo">Dia fecha</label>
            <input
              inputMode="numeric"
              value={diaFechamento}
              onChange={(e) => setDiaFechamento(e.target.value)}
              className="campo"
            />
          </div>
          <div>
            <label className="rotulo">Dia vence</label>
            <input
              inputMode="numeric"
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              className="campo"
            />
          </div>
          <div className="col-span-3">
            <Botao onClick={salvarConfig} larguraTotal tamanho="pequeno">
              Salvar configuração do cartão
            </Botao>
          </div>
        </div>
      )}

      <ConfirmModal
        aberto={confirmandoExclusao}
        titulo="Excluir fatura"
        descricao={`A fatura de "${fatura.nome}" (${formatarMoeda(fatura.valor)}) volta a ficar zerada, como se nunca tivesse sido lançada.`}
        textoConfirmar="Excluir"
        perigo
        onConfirmar={() => {
          toast.sucessoSe(onExcluir(fatura.nome), `Fatura de "${fatura.nome}" excluída.`);
          setValor(0);
          setConfirmandoExclusao(false);
        }}
        onCancelar={() => setConfirmandoExclusao(false)}
      />
    </li>
  );
}
