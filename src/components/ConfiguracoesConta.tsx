"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useModulos } from "@/lib/useModulos";
import { useConfigApp } from "@/lib/useConfigApp";
import { useToast } from "@/components/Toast";
import { Botao } from "@/components/Botao";

/**
 * O que era regra fixa do dono do app vira escolha de cada cliente
 * (auditoria O03/U04) e a portabilidade dos dados (S11).
 */
export function ConfiguracoesConta() {
  const { user } = useAuth();
  const modulos = useModulos();
  const { config, salvar } = useConfigApp();
  const toast = useToast();
  const [imposto, setImposto] = useState<string | null>(null);
  const [inicio, setInicio] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);
  const [erroExport, setErroExport] = useState<string | null>(null);

  const impostoAtual = config ? String(Math.round(config.taxaImposto * 1000) / 10).replace(".", ",") : "";
  const impostoCampo = imposto ?? impostoAtual;
  const inicioCampo = inicio ?? config?.inicioHistorico ?? "";

  async function exportar() {
    if (!user) return;
    setExportando(true);
    setErroExport(null);
    try {
      const token = await user.getIdToken();
      const r = await fetch("/api/conta/exportar", { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error();
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zxp-finance-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErroExport("Não consegui gerar o arquivo agora. Tente de novo.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <fieldset className="space-y-4 rounded-2xl border border-line bg-surface p-4">
      <legend className="px-2 text-xs font-medium text-text-muted">Módulos e configurações</legend>

      <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-3">
        <span>
          <span className="block text-sm">Comissões</span>
          <span className="block text-xs text-text-muted">
            Pra quem ganha por reunião/venda: lançamento diário e previsão do mês seguinte
          </span>
        </span>
        <input
          type="checkbox"
          checked={modulos.comissoes}
          onChange={(e) =>
            modulos.definirComissoes(e.target.checked).then((ok) =>
              ok ? toast.sucesso(e.target.checked ? "Comissões ligadas." : "Comissões desligadas.") : null
            )
          }
          className="h-5 w-5 shrink-0 accent-brand"
        />
      </label>

      <div>
        <label htmlFor="config-imposto" className="rotulo">
          Imposto sobre a renda (%)
        </label>
        <div className="flex gap-2">
          <input
            id="config-imposto"
            inputMode="decimal"
            value={impostoCampo}
            onChange={(e) => setImposto(e.target.value.replace(/[^\d,.]/g, ""))}
            className="campo flex-1"
          />
          <Botao
            variante="secundario"
            disabled={imposto === null}
            onClick={async () => {
              const n = Number((imposto ?? "").replace(",", "."));
              if (!Number.isFinite(n) || n < 0 || n > 50) {
                toast.erro("Informe um percentual entre 0 e 50.");
                return;
              }
              if (await salvar({ taxaImposto: n / 100 })) {
                setImposto(null);
                toast.sucesso("Imposto atualizado.");
              }
            }}
          >
            Salvar
          </Botao>
        </div>
        <p className="mt-1 text-xs text-text-muted">
          Usado na renda líquida, no relatório mensal e na previsão de comissão. MEI no Simples costuma
          ficar em torno de 6%; confira com seu contador.
        </p>
      </div>

      <div>
        <label htmlFor="config-inicio" className="rotulo">
          Início do seu histórico
        </label>
        <div className="flex gap-2">
          <input
            id="config-inicio"
            type="month"
            value={inicioCampo}
            onChange={(e) => setInicio(e.target.value)}
            className="campo flex-1"
          />
          <Botao
            variante="secundario"
            disabled={inicio === null || !/^\d{4}-\d{2}$/.test(inicio ?? "")}
            onClick={async () => {
              if (inicio && (await salvar({ inicioHistorico: inicio }))) {
                setInicio(null);
                toast.sucesso("Início do histórico atualizado.");
              }
            }}
          >
            Salvar
          </Botao>
        </div>
        <p className="mt-1 text-xs text-text-muted">Meses antes disso não aparecem na navegação.</p>
      </div>

      <div className="border-t border-line-soft pt-3">
        <p className="text-sm">Seus dados</p>
        <p className="text-xs text-text-muted">
          Baixa tudo o que você guardou no app (gastos, contas, parcelas, histórico) num arquivo JSON.
        </p>
        <Botao onClick={exportar} disabled={exportando} variante="secundario" tamanho="pequeno" className="mt-2">
          {exportando ? "Gerando..." : "Exportar meus dados"}
        </Botao>
        {erroExport && <p className="mt-1 text-xs text-negative">{erroExport}</p>}
      </div>
    </fieldset>
  );
}
