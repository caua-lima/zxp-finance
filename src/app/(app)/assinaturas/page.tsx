"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatarMoeda, Assinatura, UsoPercebidoAssinatura } from "@/lib/types";
import { CARTOES_PREDEFINIDOS } from "@/lib/cartoes";
import { useAssinaturas } from "@/lib/useAssinaturas";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";

function agruparPorCartao(assinaturas: Assinatura[]) {
  const grupos = new Map<string, Assinatura[]>();
  for (const a of assinaturas) {
    const chave = a.cartao ?? "Sem cartão";
    const lista = grupos.get(chave) ?? [];
    lista.push(a);
    grupos.set(chave, lista);
  }
  const ordem = [...CARTOES_PREDEFINIDOS, "Sem cartão"];
  return [...grupos.entries()].sort(
    (a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0])
  );
}

export default function AssinaturasPage() {
  const {
    assinaturas,
    loading,
    erro,
    total,
    totalNaFatura,
    totalGeral,
    adicionar,
    editar,
    remover,
    alternarAtiva,
  } = useAssinaturas();

  const [nome, setNome] = useState("");
  const [valor, setValor] = useState(0);
  const [cartao, setCartao] = useState("");
  const [naFatura, setNaFatura] = useState(false);
  const [diaRenovacao, setDiaRenovacao] = useState("");

  const grupos = useMemo(() => agruparPorCartao(assinaturas), [assinaturas]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nomeAparado = nome.trim();
    if (!nomeAparado || !valor) return;
    const dia = diaRenovacao ? parseInt(diaRenovacao, 10) : undefined;
    setNome("");
    setValor(0);
    setNaFatura(false);
    setDiaRenovacao("");
    adicionar(nomeAparado, valor, cartao || undefined, naFatura, dia).catch(
      console.error
    );
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-4">Assinaturas</h1>
      <ErroBanner mensagem={erro} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-6 space-y-2"
      >
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <input
            placeholder="Nome (ex: Netflix)"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <MoneyInput
            value={valor}
            onChange={setValor}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <select
            value={cartao}
            onChange={(e) => setCartao(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="">Sem cartão</option>
            {CARTOES_PREDEFINIDOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            placeholder="Dia renov."
            inputMode="numeric"
            value={diaRenovacao}
            onChange={(e) => setDiaRenovacao(e.target.value)}
            title="Dia da renovação (1-31), opcional"
            className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
          >
            Adicionar
          </button>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={naFatura}
            onChange={(e) => setNaFatura(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Já está na fatura do cartão (não contar de novo no total)
        </label>
      </form>

      <div className="rounded-2xl border border-line bg-surface p-4 mb-6 space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">
            Total ativo mensal (fora da fatura)
          </span>
          <span className="text-lg font-semibold text-gold">
            {formatarMoeda(total)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-sm text-text-muted">
            Já incluso em fatura do cartão
          </span>
          <span className="text-sm font-medium text-text-faint">
            {formatarMoeda(totalNaFatura)}
          </span>
        </div>
        <div className="flex justify-between items-center border-t border-line pt-2">
          <span className="text-sm text-text-muted">
            Total real em assinaturas
          </span>
          <span className="text-sm font-semibold text-text">
            {formatarMoeda(totalGeral)}
          </span>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-text-faint">Carregando...</p>
      ) : assinaturas.length === 0 ? (
        <p className="text-sm text-text-faint">
          Nenhuma assinatura cadastrada.
        </p>
      ) : (
        <div className="space-y-5">
          {grupos.map(([grupoCartao, itens]) => (
            <div key={grupoCartao}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-sm font-medium text-text-muted">
                  💳 {grupoCartao}
                </h2>
                <span className="text-xs text-text-faint">
                  {formatarMoeda(
                    itens
                      .filter((a) => a.ativa)
                      .reduce((acc, a) => acc + a.valor, 0)
                  )}
                </span>
              </div>
              <ul className="space-y-2">
                {itens.map((a) => (
                  <ItemAssinatura
                    key={a.id}
                    assinatura={a}
                    onEditar={editar}
                    onRemover={remover}
                    onAlternarAtiva={alternarAtiva}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemAssinatura({
  assinatura,
  onEditar,
  onRemover,
  onAlternarAtiva,
}: {
  assinatura: Assinatura;
  onEditar: (
    id: string,
    dados: {
      nome: string;
      valor: number;
      cartao?: string;
      naFatura?: boolean;
      diaRenovacao?: number;
      usoPercebido?: UsoPercebidoAssinatura;
    }
  ) => void;
  onRemover: (id: string, motivo: string) => void;
  onAlternarAtiva: (id: string, ativa: boolean) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [nome, setNome] = useState(assinatura.nome);
  const [valor, setValor] = useState(assinatura.valor);
  const [cartao, setCartao] = useState(assinatura.cartao ?? "");
  const [naFatura, setNaFatura] = useState(!!assinatura.naFatura);
  const [diaRenovacao, setDiaRenovacao] = useState(
    assinatura.diaRenovacao ? String(assinatura.diaRenovacao) : ""
  );
  const [usoPercebido, setUsoPercebido] = useState<UsoPercebidoAssinatura | "">(
    assinatura.usoPercebido ?? ""
  );

  function salvar() {
    const nomeAparado = nome.trim();
    if (!nomeAparado || !valor) return;
    onEditar(assinatura.id, {
      nome: nomeAparado,
      valor,
      cartao: cartao || undefined,
      naFatura,
      diaRenovacao: diaRenovacao ? parseInt(diaRenovacao, 10) : undefined,
      usoPercebido: usoPercebido || undefined,
    });
    setEditando(false);
  }

  if (editando) {
    return (
      <li className="rounded-xl border border-brand/40 bg-surface px-4 py-3 space-y-2">
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <MoneyInput
            value={valor}
            onChange={setValor}
            className="w-full sm:w-32 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <select
            value={cartao}
            onChange={(e) => setCartao(e.target.value)}
            className="w-full sm:w-40 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">Sem cartão</option>
            {CARTOES_PREDEFINIDOS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            placeholder="Dia renov."
            inputMode="numeric"
            value={diaRenovacao}
            onChange={(e) => setDiaRenovacao(e.target.value)}
            className="w-full sm:w-28 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <select
            value={usoPercebido}
            onChange={(e) => setUsoPercebido(e.target.value as UsoPercebidoAssinatura | "")}
            className="w-full sm:w-40 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          >
            <option value="">Uso: não avaliado</option>
            <option value="essencial">Uso: essencial</option>
            <option value="util">Uso: útil</option>
            <option value="revisar">Uso: revisar</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-text-muted cursor-pointer w-fit">
          <input
            type="checkbox"
            checked={naFatura}
            onChange={(e) => setNaFatura(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          Já está na fatura do cartão (não contar de novo no total)
        </label>
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
      className={`flex items-center justify-between gap-2 rounded-xl border bg-surface px-4 py-3 ${
        assinatura.ativa ? "border-line" : "border-line-soft opacity-50"
      }`}
    >
      <label className="flex items-center gap-3 min-w-0 cursor-pointer">
        <input
          type="checkbox"
          checked={assinatura.ativa}
          onChange={(e) => onAlternarAtiva(assinatura.id, e.target.checked)}
          className="h-4 w-4 shrink-0 accent-brand"
        />
        <div className="min-w-0">
          <p className="text-sm truncate">
            {assinatura.nome}
            {assinatura.diaRenovacao && (
              <span className="text-text-faint"> · renova dia {assinatura.diaRenovacao}</span>
            )}
          </p>
          <div className="flex gap-2">
            {assinatura.naFatura && (
              <p className="text-xs text-text-faint">já na fatura do cartão</p>
            )}
            {assinatura.usoPercebido === "revisar" && (
              <p className="text-xs text-gold">revisar assinatura</p>
            )}
          </div>
        </div>
      </label>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={`text-sm font-medium ${
            assinatura.naFatura ? "text-text-faint" : "text-gold"
          }`}
        >
          {formatarMoeda(assinatura.valor)}
        </span>
        <button
          onClick={() => setEditando(true)}
          className="text-text-faint hover:text-brand text-sm"
          aria-label="Editar"
        >
          ✎
        </button>
        {!assinatura.ativa && (
          <button
            onClick={() => setConfirmando(true)}
            className="text-[10px] text-text-faint hover:text-negative whitespace-nowrap"
          >
            Excluir def.
          </button>
        )}
      </div>

      <ConfirmModal
        aberto={confirmando}
        titulo="Excluir definitivamente"
        descricao={`"${assinatura.nome}" será apagada de vez — isso não pode ser desfeito. Se é só pra parar de contar no mês, desmarque a caixinha em vez de excluir.`}
        textoConfirmar="Excluir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          onRemover(assinatura.id, motivo ?? "");
          setConfirmando(false);
        }}
        onCancelar={() => setConfirmando(false)}
      />
    </li>
  );
}
