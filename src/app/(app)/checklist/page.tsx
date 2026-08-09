"use client";

import { useMemo, useState } from "react";
import {
  mesPadrao,
  formatarMoeda,
  parcelasRestantesEm,
  valorMinhaParte,
} from "@/lib/types";
import { iconeCategoria } from "@/lib/categorias";
import { useContasFixas } from "@/lib/useContasFixas";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { useParcelas } from "@/lib/useParcelas";
import { useFaturasCartao } from "@/lib/useFaturasCartao";
import { usePagamentos, OrigemItem } from "@/lib/usePagamentos";
import { useMonthClose } from "@/lib/useMonthClose";
import { MonthSelector } from "@/components/MonthSelector";
import { ErroBanner } from "@/components/ErroBanner";

interface ItemChecklist {
  id: string;
  origem: OrigemItem;
  nome: string;
  detalhe?: string;
  valor: number;
}

export default function ChecklistPage() {
  const [mes, setMes] = useState(mesPadrao());
  const contas = useContasFixas();
  const assinaturas = useAssinaturas();
  const parcelas = useParcelas();
  const faturas = useFaturasCartao(mes);
  const pagamentos = usePagamentos(mes);
  const monthClose = useMonthClose(mes);

  const loading =
    contas.loading ||
    assinaturas.loading ||
    parcelas.loading ||
    faturas.loading ||
    pagamentos.loading;
  const erro =
    contas.erro ||
    assinaturas.erro ||
    parcelas.erro ||
    faturas.erro ||
    pagamentos.erro ||
    monthClose.erro;

  const grupos = useMemo(() => {
    const itensContas: ItemChecklist[] = contas.contas
      .filter((c) => c.ativa)
      .map((c) => ({
        id: c.id,
        origem: "conta" as const,
        nome: c.nome,
        detalhe: `${iconeCategoria(c.categoria)} ${c.categoria}`,
        valor: c.valor,
      }));

    const itensAssinaturas: ItemChecklist[] = assinaturas.assinaturas
      .filter((a) => a.ativa && !a.naFatura)
      .map((a) => ({
        id: a.id,
        origem: "assinatura" as const,
        nome: a.nome,
        valor: a.valor,
      }));

    const itensParcelas: ItemChecklist[] = parcelas.parcelas
      .filter((p) => parcelasRestantesEm(p, mes) > 0 && !p.naFatura)
      .map((p) => {
        const restantes = parcelasRestantesEm(p, mes);
        const numeroAtual = p.totalParcelas - restantes + 1;
        return {
          id: p.id,
          origem: "parcela" as const,
          nome: p.nome,
          detalhe: `parcela ${numeroAtual} de ${p.totalParcelas}${
            p.dividida ? " · você paga metade" : ""
          }`,
          valor: valorMinhaParte(p),
        };
      });

    const itensFaturas: ItemChecklist[] = faturas.faturas
      .filter((f) => f.valor > 0)
      .map((f) => {
        const vinculadas = parcelas.parcelas.filter(
          (p) => p.tipo === "cartao" && p.cartao === f.nome
        );
        return {
          id: f.id,
          origem: "fatura" as const,
          nome: f.nome,
          detalhe:
            vinculadas.length > 0
              ? `dá baixa em ${vinculadas.length} parcela${
                  vinculadas.length > 1 ? "s" : ""
                } desse cartão`
              : undefined,
          valor: f.valor,
        };
      });

    return [
      { titulo: "Contas fixas", itens: itensContas },
      { titulo: "Assinaturas", itens: itensAssinaturas },
      { titulo: "Parcelas e financiamentos", itens: itensParcelas },
      { titulo: "Fatura do cartão", itens: itensFaturas },
    ];
  }, [
    contas.contas,
    assinaturas.assinaturas,
    parcelas.parcelas,
    faturas.faturas,
    mes,
  ]);

  function alternarPago(item: ItemChecklist, marcado: boolean) {
    if (monthClose.fechado) return;
    pagamentos.marcar(item.origem, item.id, marcado, {
      nome: item.nome,
      valor: item.valor,
    });

    if (item.origem === "fatura") {
      const vinculadas = parcelas.parcelas.filter(
        (p) => p.tipo === "cartao" && p.cartao === item.nome
      );
      for (const p of vinculadas) {
        if (marcado && p.parcelasRestantes > 0) {
          parcelas.darBaixa(p.id);
        } else if (!marcado && p.parcelasRestantes < p.totalParcelas) {
          parcelas.reverterBaixa(p.id);
        }
      }
    }
  }

  const todosItens = grupos.flatMap((g) => g.itens);
  const totalGeral = todosItens.reduce((acc, i) => acc + i.valor, 0);
  const itensPagos = todosItens.filter((i) =>
    pagamentos.estaPago(i.origem, i.id)
  );
  const totalPago = itensPagos.reduce((acc, i) => acc + i.valor, 0);
  const totalFalta = totalGeral - totalPago;
  const progresso =
    todosItens.length === 0
      ? 0
      : Math.round((itensPagos.length / todosItens.length) * 100);

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Checklist do mês</h1>
      <p className="text-xs text-text-faint mb-4">
        Vá marcando conforme for pagando
      </p>
      <MonthSelector mes={mes} onChange={setMes} />
      <ErroBanner mensagem={erro} />
      {monthClose.fechado && (
        <div className="mb-4 rounded-xl border border-line-soft bg-surface-2/50 px-4 py-3 text-xs text-text-faint">
          🔒 Mês fechado — marcar pago fica bloqueado. Reabra na aba DRE pra
          corrigir algo.
        </div>
      )}

      {loading ? (
        <p className="text-sm text-text-faint">Carregando...</p>
      ) : todosItens.length === 0 ? (
        <p className="text-sm text-text-faint">
          Nada a pagar neste mês. Cadastre contas fixas, assinaturas ou
          parcelas primeiro.
        </p>
      ) : (
        <div className="space-y-5">
          {/* PROGRESSO */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-baseline justify-between mb-3">
              <span className="text-sm text-text-muted">
                {itensPagos.length} de {todosItens.length} pagas
              </span>
              <span
                className={`text-2xl font-bold ${
                  progresso === 100 ? "text-positive" : "text-text"
                }`}
              >
                {progresso}%
              </span>
            </div>

            <div className="h-2 w-full rounded-full bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand transition-all duration-300"
                style={{ width: `${progresso}%` }}
              />
            </div>

            <div className="grid grid-cols-3 gap-3 mt-4 text-center">
              <div>
                <p className="text-xs text-text-faint">Total do mês</p>
                <p className="text-sm font-semibold mt-0.5">
                  {formatarMoeda(totalGeral)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-faint">Já paguei</p>
                <p className="text-sm font-semibold mt-0.5 text-positive">
                  {formatarMoeda(totalPago)}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-faint">Ainda falta</p>
                <p
                  className={`text-sm font-semibold mt-0.5 ${
                    totalFalta === 0 ? "text-positive" : "text-gold"
                  }`}
                >
                  {formatarMoeda(totalFalta)}
                </p>
              </div>
            </div>
          </div>

          {/* LISTAS */}
          {grupos.map(
            (grupo) =>
              grupo.itens.length > 0 && (
                <div key={grupo.titulo}>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h2 className="text-sm font-medium text-text-muted">
                      {grupo.titulo}
                    </h2>
                    <span className="text-xs text-text-faint">
                      {
                        grupo.itens.filter((i) =>
                          pagamentos.estaPago(i.origem, i.id)
                        ).length
                      }
                      /{grupo.itens.length}
                    </span>
                  </div>
                  <ul className="space-y-2">
                    {grupo.itens.map((item) => {
                      const pago = pagamentos.estaPago(item.origem, item.id);
                      return (
                        <li key={`${item.origem}-${item.id}`}>
                          <label
                            className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                              pago
                                ? "border-brand/30 bg-brand-soft/40"
                                : "border-line bg-surface hover:border-brand/25"
                            }`}
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <input
                                type="checkbox"
                                checked={pago}
                                disabled={monthClose.fechado}
                                onChange={(e) =>
                                  alternarPago(item, e.target.checked)
                                }
                                className="h-5 w-5 shrink-0 accent-brand disabled:opacity-40 disabled:cursor-not-allowed"
                              />
                              <div className="min-w-0">
                                <p
                                  className={`text-sm truncate ${
                                    pago
                                      ? "line-through text-text-muted"
                                      : "text-text"
                                  }`}
                                >
                                  {item.nome}
                                </p>
                                {item.detalhe && (
                                  <p className="text-xs text-text-faint truncate">
                                    {item.detalhe}
                                  </p>
                                )}
                              </div>
                            </div>
                            <span
                              className={`text-sm font-medium shrink-0 ${
                                pago ? "text-text-faint" : "text-gold"
                              }`}
                            >
                              {formatarMoeda(item.valor)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )
          )}
        </div>
      )}
    </div>
  );
}
