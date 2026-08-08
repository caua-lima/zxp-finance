"use client";

import { useState } from "react";
import { mesPadrao, formatarMoeda, FaturaCartao } from "@/lib/types";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { useCartoesConfig, CartaoConfig } from "@/lib/useCartoesConfig";
import { MonthSelector } from "@/components/MonthSelector";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";

export default function FaturaPage() {
  const [mes, setMes] = useState(mesPadrao());
  const { faturas, loading, erro, total, salvar } = useFaturasCartao(mes);
  const cartoesConfig = useCartoesConfig();

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Fatura do cartão</h1>
      <p className="text-xs text-text-faint mb-4">
        Lance o valor total da fatura de cada cartão neste mês — fica
        zerado enquanto não lançar
      </p>
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={erro || cartoesConfig.erro} />

      <div className="rounded-2xl border border-line bg-surface p-4 mb-6 flex justify-between items-center">
        <span className="text-sm text-text-muted">Total em faturas do mês</span>
        <span className="text-lg font-semibold text-gold">
          {formatarMoeda(total)}
        </span>
      </div>

      {loading ? (
        <p className="text-sm text-text-faint">Carregando...</p>
      ) : (
        <ul className="space-y-3">
          {faturas.map((f) => (
            <ItemFatura
              key={`${mes}-${f.nome}`}
              fatura={f}
              config={cartoesConfig.configs.find((c) => c.nome === f.nome) ?? { nome: f.nome }}
              onSalvar={salvar}
              onSalvarConfig={cartoesConfig.salvar}
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
  onSalvar,
  onSalvarConfig,
}: {
  fatura: FaturaCartao;
  config: CartaoConfig;
  onSalvar: (cartao: string, valor: number) => void;
  onSalvarConfig: (
    cartao: string,
    dados: { limite?: number; diaFechamento?: number; diaVencimento?: number }
  ) => void;
}) {
  const [valor, setValor] = useState(fatura.valor);
  const alterado = valor !== fatura.valor;
  const [editandoConfig, setEditandoConfig] = useState(false);
  const [limite, setLimite] = useState(config.limite ?? 0);
  const [diaFechamento, setDiaFechamento] = useState(
    config.diaFechamento ? String(config.diaFechamento) : ""
  );
  const [diaVencimento, setDiaVencimento] = useState(
    config.diaVencimento ? String(config.diaVencimento) : ""
  );

  const percentualUsado = config.limite ? (fatura.valor / config.limite) * 100 : null;

  function salvarConfig() {
    onSalvarConfig(fatura.nome, {
      limite: limite || undefined,
      diaFechamento: diaFechamento ? parseInt(diaFechamento, 10) : undefined,
      diaVencimento: diaVencimento ? parseInt(diaVencimento, 10) : undefined,
    });
    setEditandoConfig(false);
  }

  return (
    <li className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm min-w-0 truncate">💳 {fatura.nome}</span>
        <div className="flex items-center gap-2 shrink-0">
          <MoneyInput
            value={valor}
            onChange={setValor}
            className="w-32 rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm outline-none focus:border-brand text-right"
          />
          <button
            onClick={() => onSalvar(fatura.nome, valor)}
            disabled={!alterado}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-[#0E0F0C] disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
          >
            Salvar
          </button>
        </div>
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
        {config.diaVencimento && <span>vence dia {config.diaVencimento}</span>}
        <button
          onClick={() => setEditandoConfig((v) => !v)}
          className="text-brand hover:text-brand-dark"
        >
          {editandoConfig ? "fechar" : "configurar cartão"}
        </button>
      </div>

      {editandoConfig && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <MoneyInput
            value={limite}
            onChange={setLimite}
            placeholder="Limite"
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <input
            placeholder="Dia fecha"
            inputMode="numeric"
            value={diaFechamento}
            onChange={(e) => setDiaFechamento(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <input
            placeholder="Dia vence"
            inputMode="numeric"
            value={diaVencimento}
            onChange={(e) => setDiaVencimento(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={salvarConfig}
            className="col-span-3 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-[#0E0F0C]"
          >
            Salvar configuração do cartão
          </button>
        </div>
      )}
    </li>
  );
}
