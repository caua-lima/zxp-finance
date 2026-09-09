"use client";

import { FormEvent, useState } from "react";
import { formatarMoeda, Caixinha } from "@/lib/types";
import { useCaixinhas } from "@/lib/useCaixinhas";
import {
  totalGuardado,
  totalPorGasto,
  progressoDaMeta,
  faltaParaMeta,
  gastosAteAMeta,
} from "@/lib/finance/caixinhas";
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

export default function CaixinhasPage() {
  const {
    caixinhas,
    loading,
    erro,
    criar,
    editar,
    ajustarSaldo,
    alternarAtiva,
    remover,
  } = useCaixinhas();
  const toast = useToast();

  const [nome, setNome] = useState("");
  const [saldo, setSaldo] = useState(0);
  const [porGasto, setPorGasto] = useState(0);
  const [meta, setMeta] = useState(0);

  const guardado = totalGuardado(caixinhas);
  const porTransacao = totalPorGasto(caixinhas);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nomeAparado = nome.trim();
    if (!nomeAparado || porGasto <= 0) return;
    const dados = { nome: nomeAparado, saldo, porGasto, meta: meta || undefined };
    setNome("");
    setSaldo(0);
    setPorGasto(0);
    setMeta(0);
    toast.sucessoSe(criar(dados), `Caixinha "${nomeAparado}" criada.`);
  }

  return (
    <div>
      <PageHeader
        titulo="Caixinhas"
        descricao="Guarda um trocado sozinho toda vez que você registra um gasto"
      />
      <ErroBanner mensagem={erro} />

      {/* O resumo vem antes do formulário: depois da primeira caixinha
          criada, o que você abre essa tela pra ver é o quanto já juntou. */}
      <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-text-muted">Total guardado</span>
          <span className="text-2xl font-semibold text-positive">
            {formatarMoeda(guardado)}
          </span>
        </div>
        {porTransacao > 0 && (
          <p className="mt-2 border-t border-line-soft pt-2 text-xs text-text-faint">
            A cada gasto que você registrar, {formatarMoeda(porTransacao)} vai
            pras caixinhas — não importa se o gasto foi de R$ 0,01 ou de R$ 800.
          </p>
        )}
      </div>

      {/* O aviso mais importante da tela: caixinha é marcação, não
          transferência. Sem isso ele somaria duas vezes o mesmo dinheiro
          quando fosse conferir o saldo do banco. */}
      <div className="mb-4 rounded-xl border border-line-soft bg-surface-2/50 px-4 py-3 text-xs text-text-muted">
        <strong className="text-text">Caixinha não tira do seu saldo.</strong> O
        dinheiro continua na conta — a caixinha só marca quanto dele já tem
        dono. Assim, quando você conferir o saldo do banco, os números batem.
        Se quiser separar de verdade, faça a transferência no app do banco.
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-5 space-y-3"
      >
        <div>
          <label htmlFor="caixinha-form-nome" className="rotulo">
            Nome da caixinha
          </label>
          <input
            id="caixinha-form-nome"
            placeholder="ex: Sair de casa"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="campo"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="rotulo">Quanto já tem guardado</label>
            <MoneyInput value={saldo} onChange={setSaldo} className="campo" />
          </div>
          <div>
            <label className="rotulo">Guarda quanto por gasto</label>
            <MoneyInput
              value={porGasto}
              onChange={setPorGasto}
              className="campo"
            />
          </div>
        </div>
        <div>
          <label className="rotulo">Meta (opcional)</label>
          <MoneyInput value={meta} onChange={setMeta} className="campo" />
        </div>
        <Botao type="submit" larguraTotal disabled={!nome.trim() || porGasto <= 0}>
          Criar caixinha
        </Botao>
      </form>

      {loading ? (
        <SkeletonLista linhas={3} />
      ) : caixinhas.length === 0 ? (
        <EmptyState
          mensagem="Nenhuma caixinha ainda. Comece com uma de R$ 0,10 por gasto e veja onde chega."
          alvoId="caixinha-form-nome"
          textoAcao="Criar a primeira"
        />
      ) : (
        <ul className="space-y-2">
          {caixinhas.map((c) => (
            <ItemCaixinha
              key={c.id}
              caixinha={c}
              onEditar={editar}
              onAjustarSaldo={ajustarSaldo}
              onAlternarAtiva={alternarAtiva}
              onRemover={remover}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemCaixinha({
  caixinha,
  onEditar,
  onAjustarSaldo,
  onAlternarAtiva,
  onRemover,
}: {
  caixinha: Caixinha;
  onEditar: (
    id: string,
    dados: { nome: string; porGasto: number; meta?: number }
  ) => Promise<boolean>;
  onAjustarSaldo: (id: string, novoSaldo: number) => Promise<boolean>;
  onAlternarAtiva: (id: string) => Promise<boolean>;
  onRemover: (id: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [nome, setNome] = useState(caixinha.nome);
  const [porGasto, setPorGasto] = useState(caixinha.porGasto);
  const [meta, setMeta] = useState(caixinha.meta ?? 0);
  const [saldo, setSaldo] = useState(caixinha.saldo);
  const toast = useToast();

  const progresso = progressoDaMeta(caixinha);
  const falta = faltaParaMeta(caixinha);
  const gastosRestantes = gastosAteAMeta(caixinha);

  function salvar() {
    const nomeAparado = nome.trim();
    if (!nomeAparado || porGasto <= 0) return;
    toast.sucessoSe(
      onEditar(caixinha.id, { nome: nomeAparado, porGasto, meta: meta || undefined }),
      "Caixinha atualizada."
    );
    if (saldo !== caixinha.saldo) {
      onAjustarSaldo(caixinha.id, saldo).catch(console.error);
    }
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
            <label className="rotulo">Quanto tem guardado</label>
            <MoneyInput value={saldo} onChange={setSaldo} className="campo" />
          </div>
          <div>
            <label className="rotulo">Guarda por gasto</label>
            <MoneyInput
              value={porGasto}
              onChange={setPorGasto}
              className="campo"
            />
          </div>
        </div>
        <div>
          <label className="rotulo">Meta (0 = sem meta)</label>
          <MoneyInput value={meta} onChange={setMeta} className="campo" />
        </div>
        <div className="flex gap-2">
          <Botao onClick={salvar} tamanho="pequeno">
            Salvar
          </Botao>
          <Botao
            onClick={() => {
              setNome(caixinha.nome);
              setPorGasto(caixinha.porGasto);
              setMeta(caixinha.meta ?? 0);
              setSaldo(caixinha.saldo);
              setEditando(false);
            }}
            variante="secundario"
            tamanho="pequeno"
          >
            Cancelar
          </Botao>
        </div>
      </li>
    );
  }

  return (
    <li
      className={`rounded-xl border border-line bg-surface px-4 py-3 ${
        caixinha.ativa ? "" : "opacity-60"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            🐷 {caixinha.nome}
            {!caixinha.ativa && (
              <span className="ml-2 text-[11px] font-normal text-text-faint">
                pausada
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-faint">
            {caixinha.ativa
              ? `${formatarMoeda(caixinha.porGasto)} por gasto`
              : "não guarda enquanto estiver pausada"}
            {caixinha.depositos > 0 && ` · ${caixinha.depositos} depósitos`}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-semibold text-positive">
            {formatarMoeda(caixinha.saldo)}
          </p>
        </div>
        <AcoesItem>
          <BotaoIcone label="Editar caixinha" onClick={() => setEditando(true)}>
            <IconEditar width={17} height={17} />
          </BotaoIcone>
          <BotaoIcone
            label="Excluir caixinha"
            tom="perigo"
            onClick={() => setConfirmando(true)}
          >
            <IconExcluir width={17} height={17} />
          </BotaoIcone>
        </AcoesItem>
      </div>

      {progresso !== null && (
        <div className="mt-2.5">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={progresso}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Progresso da meta de ${caixinha.nome}`}
          >
            <div
              className="h-full rounded-full bg-positive transition-[width] duration-500"
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-text-faint">
            {falta === 0
              ? `Meta de ${formatarMoeda(caixinha.meta!)} batida 🎉`
              : `${progresso}% de ${formatarMoeda(caixinha.meta!)} · faltam ${formatarMoeda(falta!)}${
                  gastosRestantes !== null
                    ? ` (uns ${gastosRestantes} gastos)`
                    : ""
                }`}
          </p>
        </div>
      )}

      <button
        onClick={() =>
          toast.sucessoSe(
            onAlternarAtiva(caixinha.id),
            caixinha.ativa
              ? `"${caixinha.nome}" pausada.`
              : `"${caixinha.nome}" voltou a guardar.`
          )
        }
        className="mt-2 text-xs font-medium text-brand hover:text-brand-dark"
      >
        {caixinha.ativa ? "Pausar depósitos" : "Voltar a guardar"}
      </button>

      <ConfirmModal
        aberto={confirmando}
        titulo={`Excluir "${caixinha.nome}"?`}
        descricao={`Os ${formatarMoeda(
          caixinha.saldo
        )} guardados somem do controle. O dinheiro em si não muda — ele nunca saiu da sua conta.`}
        textoConfirmar="Excluir"
        perigo
        onConfirmar={() => {
          setConfirmando(false);
          toast.sucessoSe(onRemover(caixinha.id), "Caixinha excluída.");
        }}
        onCancelar={() => setConfirmando(false)}
      />
    </li>
  );
}
