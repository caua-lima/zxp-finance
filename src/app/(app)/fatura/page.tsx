"use client";

import { useState } from "react";
import { mesPadrao, formatarMoeda, FaturaCartao } from "@/lib/types";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { useCartoesConfig, CartaoConfig } from "@/lib/useCartoesConfig";
import { useMonthClose } from "@/lib/useMonthClose";
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

export default function FaturaPage() {
  const [mes, setMes] = useState(mesPadrao());
  const { faturas, loading, erro, total, salvar, excluir } = useFaturasCartao(mes);
  const cartoesConfig = useCartoesConfig();
  const monthClose = useMonthClose(mes);

  return (
    <div>
      <PageHeader
        titulo="Fatura do cartão"
        descricao="Lance o valor total de cada cartão neste mês"
      />
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={erro || cartoesConfig.erro || monthClose.erro} />
      {monthClose.fechado && (
        <div className="mb-4 rounded-xl border border-line-soft bg-surface-2/50 px-4 py-3 text-xs text-text-faint">
          🔒 Mês fechado — lançar fatura fica bloqueado. Reabra na aba DRE
          pra corrigir algo.
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-4 mb-6 flex justify-between items-center">
        <span className="text-sm text-text-muted">Total em faturas do mês</span>
        <span className="text-lg font-semibold text-gold">
          {formatarMoeda(total)}
        </span>
      </div>

      {loading ? (
        <SkeletonLista linhas={3} />
      ) : (
        <ul className="space-y-3">
          {faturas.map((f) => (
            <ItemFatura
              key={`${mes}-${f.nome}`}
              fatura={f}
              config={cartoesConfig.configs.find((c) => c.nome === f.nome) ?? { nome: f.nome }}
              mes={mes}
              onSalvar={salvar}
              onExcluir={excluir}
              onSalvarConfig={cartoesConfig.salvar}
              bloqueado={monthClose.fechado}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemFatura({
  fatura,
  config,
  mes,
  onSalvar,
  onExcluir,
  onSalvarConfig,
  bloqueado,
}: {
  fatura: FaturaCartao;
  config: CartaoConfig;
  mes: string;
  onSalvar: (cartao: string, valor: number) => void;
  onExcluir: (cartao: string) => void;
  onSalvarConfig: (
    cartao: string,
    dados: { limite?: number; diaFechamento?: number; diaVencimento?: number }
  ) => void;
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

  const percentualUsado = config.limite ? (fatura.valor / config.limite) * 100 : null;
  const diasRestantes = config.diaVencimento
    ? diasAteVencimento(config.diaVencimento, mes, hojeISO())
    : null;

  function salvarConfig() {
    onSalvarConfig(fatura.nome, {
      limite: limite || undefined,
      diaFechamento: diaFechamento ? parseInt(diaFechamento, 10) : undefined,
      diaVencimento: diaVencimento ? parseInt(diaVencimento, 10) : undefined,
    });
    setEditandoConfig(false);
    toast.sucesso(`Configuração de "${fatura.nome}" salva.`);
  }

  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="mb-2 truncate text-sm font-medium">💳 {fatura.nome}</p>
      <div className="flex items-center gap-2">
        <MoneyInput
          value={valor}
          onChange={setValor}
          className="campo flex-1 text-right font-semibold"
        />
        <Botao
          onClick={() => {
            onSalvar(fatura.nome, valor);
            toast.sucesso(`Fatura de "${fatura.nome}" atualizada.`);
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-text-faint">
        {config.limite ? (
          <span className={percentualUsado! >= 80 ? "text-negative" : ""}>
            {percentualUsado!.toFixed(0)}% do limite ({formatarMoeda(config.limite)})
          </span>
        ) : (
          <span>Limite não informado</span>
        )}
        {config.diaFechamento && <span>fecha dia {config.diaFechamento}</span>}
        <button
          onClick={() => setEditandoConfig((v) => !v)}
          className="text-brand hover:text-brand-dark"
        >
          {editandoConfig ? "fechar" : "configurar cartão"}
        </button>
      </div>

      {/* vencimento em destaque — é o que dispara a notificação no celular */}
      {config.diaVencimento ? (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line-soft bg-surface-2/50 px-3 py-2">
          <span className="text-xs text-text-muted">
            🔔 Vence <strong className="text-text">dia {config.diaVencimento}</strong>
            {diasRestantes !== null && fatura.valor > 0 && (
              <span
                className={
                  diasRestantes < 0
                    ? "text-negative"
                    : diasRestantes <= 5
                    ? "text-gold"
                    : "text-text-faint"
                }
              >
                {" · "}
                {diasRestantes < 0
                  ? `venceu há ${Math.abs(diasRestantes)} dia(s)`
                  : diasRestantes === 0
                  ? "é hoje"
                  : diasRestantes === 1
                  ? "amanhã"
                  : `em ${diasRestantes} dias`}
              </span>
            )}
          </span>
          <span className="text-[11px] text-text-faint">
            Aviso no celular 5 dias antes, 1 dia antes e no dia
          </span>
        </div>
      ) : (
        <button
          onClick={() => setEditandoConfig(true)}
          className="mt-2 w-full rounded-lg border border-dashed border-line px-3 py-2 text-left text-xs text-text-faint hover:border-brand/40 hover:text-text-muted transition-colors"
        >
          + Adicionar dia de vencimento{" "}
          <span className="text-text-faint">
            — sem isso não dá pra avisar você no celular antes de vencer
          </span>
        </button>
      )}

      {editandoConfig && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <MoneyInput
            value={limite}
            onChange={setLimite}
            placeholder="Limite"
            className="campo"
          />
          <input
            placeholder="Dia fecha"
            inputMode="numeric"
            value={diaFechamento}
            onChange={(e) => setDiaFechamento(e.target.value)}
            className="campo"
          />
          <input
            placeholder="Dia vence"
            inputMode="numeric"
            value={diaVencimento}
            onChange={(e) => setDiaVencimento(e.target.value)}
            className="campo"
          />
          <button
            onClick={salvarConfig}
            className="col-span-3 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-[#0E0F0C]"
          >
            Salvar configuração do cartão
          </button>
        </div>
      )}

      <ConfirmModal
        aberto={confirmandoExclusao}
        titulo="Excluir fatura"
        descricao={`A fatura de "${fatura.nome}" (${formatarMoeda(fatura.valor)}) volta a ficar zerada, como se nunca tivesse sido lançada.`}
        textoConfirmar="Excluir"
        perigo
        onConfirmar={() => {
          onExcluir(fatura.nome);
          setValor(0);
          toast.sucesso(`Fatura de "${fatura.nome}" excluída.`);
          setConfirmandoExclusao(false);
        }}
        onCancelar={() => setConfirmandoExclusao(false)}
      />
    </li>
  );
}
