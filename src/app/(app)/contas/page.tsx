"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatarMoeda, ContaFixa } from "@/lib/types";
import { CATEGORIAS_CONTAS, iconeCategoria } from "@/lib/categorias";
import { useContasFixas } from "@/lib/useContasFixas";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SkeletonLista } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { BotaoIcone, AcoesItem } from "@/components/BotaoIcone";
import { IconEditar, IconExcluir } from "@/components/icons";

function agruparPorCategoria(contas: ContaFixa[]) {
  const grupos = new Map<string, ContaFixa[]>();
  for (const c of contas) {
    const lista = grupos.get(c.categoria) ?? [];
    lista.push(c);
    grupos.set(c.categoria, lista);
  }
  const ordemConhecida = CATEGORIAS_CONTAS as readonly string[];
  return [...grupos.entries()].sort((a, b) => {
    const ia = ordemConhecida.indexOf(a[0]);
    const ib = ordemConhecida.indexOf(b[0]);
    if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

export default function ContasPage() {
  const {
    contas,
    loading,
    erro,
    total,
    adicionar,
    editar,
    remover,
    alternarAtiva,
  } = useContasFixas();

  const [nome, setNome] = useState("");
  const [valor, setValor] = useState(0);
  const [categoria, setCategoria] = useState<string>(CATEGORIAS_CONTAS[0]);
  const [categoriaCustom, setCategoriaCustom] = useState("");
  const [diaVencimento, setDiaVencimento] = useState("");
  const toast = useToast();

  const grupos = useMemo(() => agruparPorCategoria(contas), [contas]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nomeAparado = nome.trim();
    if (!nomeAparado || !valor) return;
    const cat =
      categoria === "Outros" && categoriaCustom.trim()
        ? categoriaCustom.trim()
        : categoria;
    const dia = diaVencimento ? parseInt(diaVencimento, 10) : undefined;
    setNome("");
    setValor(0);
    setCategoriaCustom("");
    setDiaVencimento("");
    toast.sucessoSe(adicionar(nomeAparado, valor, cat, dia), `"${nomeAparado}" adicionada.`);
  }

  return (
    <div>
      <PageHeader
        titulo="Contas fixas"
        descricao="O que vence todo mês, independente do que você fizer"
      />
      <ErroBanner mensagem={erro} />

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-4 space-y-3"
      >
        <div>
          <label htmlFor="contas-form-nome" className="rotulo">
            Nome da conta
          </label>
          <input
            id="contas-form-nome"
            placeholder="ex: Internet"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="rotulo">Valor</label>
            <MoneyInput value={valor} onChange={setValor} className="campo" />
          </div>
          <div>
            <label className="rotulo">Dia do vencimento</label>
            <input
              placeholder="opcional"
              inputMode="numeric"
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              className="campo"
            />
          </div>
        </div>
        <div>
          <label className="rotulo">Categoria</label>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="campo"
          >
            {CATEGORIAS_CONTAS.map((cat) => (
              <option key={cat} value={cat}>
                {iconeCategoria(cat)} {cat}
              </option>
            ))}
          </select>
        </div>
        {categoria === "Outros" && (
          <input
            placeholder="Nome da categoria (opcional)"
            value={categoriaCustom}
            onChange={(e) => setCategoriaCustom(e.target.value)}
            className="campo"
          />
        )}
        <Botao type="submit" larguraTotal>
          Adicionar conta
        </Botao>
      </form>

      <div className="rounded-2xl border border-line bg-surface p-4 mb-5 flex justify-between items-center">
        <span className="text-sm text-text-muted">Total ativo mensal</span>
        <span className="text-lg font-semibold text-gold">
          {formatarMoeda(total)}
        </span>
      </div>

      {loading ? (
        <SkeletonLista linhas={4} />
      ) : contas.length === 0 ? (
        <EmptyState
          mensagem="Nenhuma conta fixa cadastrada."
          alvoId="contas-form-nome"
        />
      ) : (
        <div className="space-y-5">
          {grupos.map(([nomeCategoria, itens]) => (
            <GrupoCategoria
              key={nomeCategoria}
              categoria={nomeCategoria}
              itens={itens}
              onEditar={editar}
              onRemover={remover}
              onAlternarAtiva={alternarAtiva}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GrupoCategoria({
  categoria,
  itens,
  onEditar,
  onRemover,
  onAlternarAtiva,
}: {
  categoria: string;
  itens: ContaFixa[];
  onEditar: (
    id: string,
    dados: { nome: string; valor: number; categoria: string; diaVencimento?: number }
  ) => Promise<boolean>;
  onRemover: (id: string, motivo: string) => Promise<boolean>;
  onAlternarAtiva: (id: string, ativa: boolean) => Promise<boolean>;
}) {
  const subtotal = itens
    .filter((c) => c.ativa)
    .reduce((acc, c) => acc + c.valor, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-medium text-text-muted flex items-center gap-1.5">
          <span>{iconeCategoria(categoria)}</span>
          {categoria}
        </h2>
        <span className="text-xs text-text-faint">
          {formatarMoeda(subtotal)}
        </span>
      </div>
      <ul className="space-y-2">
        {itens.map((c) => (
          <ItemConta
            key={c.id}
            conta={c}
            onEditar={onEditar}
            onRemover={onRemover}
            onAlternarAtiva={onAlternarAtiva}
          />
        ))}
      </ul>
    </div>
  );
}

function ItemConta({
  conta,
  onEditar,
  onRemover,
  onAlternarAtiva,
}: {
  conta: ContaFixa;
  onEditar: (
    id: string,
    dados: { nome: string; valor: number; categoria: string; diaVencimento?: number }
  ) => Promise<boolean>;
  onRemover: (id: string, motivo: string) => Promise<boolean>;
  onAlternarAtiva: (id: string, ativa: boolean) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [nome, setNome] = useState(conta.nome);
  const [valor, setValor] = useState(conta.valor);
  const [categoria, setCategoria] = useState(conta.categoria);
  const [diaVencimento, setDiaVencimento] = useState(
    conta.diaVencimento ? String(conta.diaVencimento) : ""
  );
  const toast = useToast();

  function salvar() {
    const nomeAparado = nome.trim();
    if (!nomeAparado || !valor) return;
    toast.sucessoSe(
      onEditar(conta.id, {
        nome: nomeAparado,
        valor,
        categoria: categoria.trim() || "Outros",
        diaVencimento: diaVencimento ? parseInt(diaVencimento, 10) : undefined,
      }),
      "Conta atualizada."
    );
    setEditando(false);
  }

  if (editando) {
    return (
      <li className="rounded-xl border border-brand/40 bg-surface p-4 space-y-3">
        <div>
          <label className="rotulo">Nome</label>
          <input
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="rotulo">Valor</label>
            <MoneyInput value={valor} onChange={setValor} className="campo" />
          </div>
          <div>
            <label className="rotulo">Dia do vencimento</label>
            <input
              placeholder="opcional"
              inputMode="numeric"
              value={diaVencimento}
              onChange={(e) => setDiaVencimento(e.target.value)}
              className="campo"
            />
          </div>
        </div>
        <div>
          <label className="rotulo">Categoria</label>
          <select
            value={
              (CATEGORIAS_CONTAS as readonly string[]).includes(categoria)
                ? categoria
                : "Outros"
            }
            onChange={(e) => setCategoria(e.target.value)}
            className="campo"
          >
            {CATEGORIAS_CONTAS.map((cat) => (
              <option key={cat} value={cat}>
                {iconeCategoria(cat)} {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Botao onClick={salvar} larguraTotal>
            Salvar
          </Botao>
          <Botao onClick={() => setEditando(false)} variante="secundario" larguraTotal>
            Cancelar
          </Botao>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`flex items-center gap-2 rounded-xl border bg-surface pl-4 pr-2 py-2 ${
        conta.ativa ? "border-line" : "border-line-soft opacity-50"
      }`}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5">
        <input
          type="checkbox"
          checked={conta.ativa}
          onChange={(e) => {
            toast.sucessoSe(onAlternarAtiva(conta.id, e.target.checked), e.target.checked ? "Conta reativada." : "Conta arquivada.");
          }}
          className="h-5 w-5 shrink-0 accent-brand"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{conta.nome}</span>
          {conta.diaVencimento && (
            <span className="block text-xs text-text-faint">
              vence dia {conta.diaVencimento}
            </span>
          )}
        </span>
        <span className="shrink-0 text-sm font-medium text-gold">
          {formatarMoeda(conta.valor)}
        </span>
      </label>
      <AcoesItem>
        <BotaoIcone label="Editar conta" onClick={() => setEditando(true)}>
          <IconEditar width={17} height={17} />
        </BotaoIcone>
        {!conta.ativa && (
          <BotaoIcone
            label="Excluir definitivamente"
            tom="perigo"
            onClick={() => setConfirmando(true)}
          >
            <IconExcluir width={17} height={17} />
          </BotaoIcone>
        )}
      </AcoesItem>

      <ConfirmModal
        aberto={confirmando}
        titulo="Excluir definitivamente"
        descricao={`"${conta.nome}" será apagada de vez — isso não pode ser desfeito. Se é só pra parar de contar no mês, desmarque a caixinha em vez de excluir.`}
        textoConfirmar="Excluir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          toast.sucessoSe(onRemover(conta.id, motivo ?? ""), "Conta excluída.");
          setConfirmando(false);
        }}
        onCancelar={() => setConfirmando(false)}
      />
    </li>
  );
}
