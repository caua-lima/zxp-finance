"use client";

import { FormEvent, useState } from "react";
import { formatarMoeda, Caixinha } from "@/lib/types";
import { useCaixinhas } from "@/lib/useCaixinhas";
import { useCdi, InfoCdi } from "@/lib/useCdi";
import { estimarRendimentoMensal } from "@/lib/finance/rendimento";
import {
  totalGuardado,
  totalPorGasto,
  progressoDaMeta,
  faltaParaMeta,
  gastosAteAMeta,
} from "@/lib/finance/caixinhas";
import { MoneyInput } from "@/components/MoneyInput";
import { Dialogo } from "@/components/Dialogo";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { SkeletonLista } from "@/components/Skeleton";
import { useToast } from "@/components/Toast";
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
    transferir,
  } = useCaixinhas();
  const toast = useToast();
  const cdi = useCdi();

  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState("");
  const [saldo, setSaldo] = useState(0);
  const [porGasto, setPorGasto] = useState(0.1);
  const [meta, setMeta] = useState(0);
  const [percentualCdi, setPercentualCdi] = useState("100");

  const guardado = totalGuardado(caixinhas);
  const porTransacao = totalPorGasto(caixinhas);
  // estimativa, não dinheiro: nada disso é somado ao saldo das caixinhas
  const estimativaMensal = cdi.info
    ? caixinhas.reduce(
        (acc, c) =>
          acc + estimarRendimentoMensal(c.saldo, cdi.info!.taxaDiaria, c.percentualCdi ?? 0),
        0
      )
    : 0;
  const formularioAberto = criando || (!loading && caixinhas.length === 0);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const nomeAparado = nome.trim();
    if (!nomeAparado) return;
    const dados = {
      nome: nomeAparado,
      saldo,
      porGasto,
      meta: meta || undefined,
      percentualCdi: Number(percentualCdi) || 0,
    };
    setNome("");
    setSaldo(0);
    setPorGasto(0.1);
    setMeta(0);
    setPercentualCdi("100");
    setCriando(false);
    toast.sucessoSe(criar(dados), `Caixinha "${nomeAparado}" criada.`);
  }

  return (
    <div>
      <PageHeader
        titulo="Metas e caixinhas"
        descricao="Seus cofrinhos crescendo a cada vez que você investe em você"
      />
      <ErroBanner mensagem={erro} />

      {/* o que você abre essa tela pra ver: quanto já juntou e quanto rendeu */}
      <div className="mb-4 rounded-2xl border border-brand/25 bg-surface-elevated p-4">
        <p className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">
          Total guardado
        </p>
        <p className="mt-0.5 text-3xl font-bold tracking-tight text-positive">
          {formatarMoeda(guardado)}
        </p>
        <div className="mt-3 space-y-1 border-t border-line-soft pt-3 text-xs text-text-muted">
          <p role="status">
            {cdi.status === "erro" ? (
              <>
                Não consegui buscar o CDI no Banco Central.{" "}
                <button type="button" onClick={cdi.tentarDeNovo} className="font-medium text-brand">
                  Tentar de novo
                </button>
              </>
            ) : cdi.info ? (
              <>
                Rendimento estimado:{" "}
                <strong className="text-text">~{formatarMoeda(estimativaMensal)}/mês</strong>{" "}
                <span className="text-text-muted">
                  (CDI de {cdi.info.data.split("-").reverse().join("/")}, ~
                  {cdi.info.anual.toFixed(2).replace(".", ",")}% ao ano, fonte Banco Central)
                </span>
              </>
            ) : (
              "Buscando a taxa do CDI..."
            )}
          </p>
          {porTransacao > 0 && (
            <p>
              A cada gasto registrado, +{formatarMoeda(porTransacao)} vai pras caixinhas.
            </p>
          )}
        </div>
      </div>

      {formularioAberto ? (
        <form
          onSubmit={handleSubmit}
          className="mb-5 space-y-3 rounded-2xl border border-brand/40 bg-surface p-4"
        >
          <div>
            <label htmlFor="caixinha-form-nome" className="rotulo">
              Nome da caixinha
            </label>
            <input
              id="caixinha-form-nome"
              placeholder="ex: Viagem, Reserva, Carro"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="campo"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="rotulo">Quanto já tem nela</label>
              <MoneyInput value={saldo} onChange={setSaldo} className="campo" />
            </div>
            <div>
              <label className="rotulo">Rende quanto do CDI (%)</label>
              <input
                inputMode="numeric"
                value={percentualCdi}
                onChange={(e) => setPercentualCdi(e.target.value.replace(/\D/g, ""))}
                className="campo"
              />
            </div>
            <div>
              <label className="rotulo">Guarda a cada registro</label>
              <MoneyInput value={porGasto} onChange={setPorGasto} className="campo" />
            </div>
            <div>
              <label className="rotulo">Meta (opcional)</label>
              <MoneyInput value={meta} onChange={setMeta} className="campo" />
            </div>
          </div>
          <p className="text-xs text-text-faint">
            Cofrinho do Mercado Pago rende 100% do CDI. &quot;Guarda por gasto&quot; = quanto separa a cada
            gasto registrado (0 = só rende, não recebe depósito).
          </p>
          <div className="flex gap-2">
            <Botao type="submit" larguraTotal disabled={!nome.trim()}>
              Criar caixinha
            </Botao>
            {caixinhas.length > 0 && (
              <Botao onClick={() => setCriando(false)} variante="secundario" larguraTotal>
                Cancelar
              </Botao>
            )}
          </div>
        </form>
      ) : (
        <Botao onClick={() => setCriando(true)} larguraTotal className="mb-4">
          + Nova caixinha
        </Botao>
      )}

      {loading ? (
        <SkeletonLista linhas={3} />
      ) : caixinhas.length === 0 ? null : (
        <ul className="space-y-2">
          {caixinhas.map((c) => (
            <ItemCaixinha
              key={c.id}
              caixinha={c}
              onEditar={editar}
              onAjustarSaldo={ajustarSaldo}
              onAlternarAtiva={alternarAtiva}
              onRemover={remover}
              onTransferir={transferir}
              cdi={cdi.info}
            />
          ))}
        </ul>
      )}

      <details className="mt-6 rounded-2xl border border-line bg-surface px-4 py-3 text-xs text-text-muted">
        <summary className="cursor-pointer text-sm">Como as caixinhas funcionam</summary>
        <div className="mt-2 space-y-2 leading-relaxed">
          <p>
            <strong className="text-text">Rendimento é estimativa:</strong> o app mostra quanto
            cada caixinha tende a render pelo CDI de hoje (taxa oficial do Banco Central), no
            percentual que você configurou, bruto de IR. Esse valor nunca é somado sozinho — o
            saldo da caixinha só muda por depósito ou quando você corrige com o valor que o
            banco mostra.
          </p>
          <p>
            <strong className="text-text">Caixinha é dinheiro separado da conta:</strong>{" "}
            <em>Guardar</em> tira do seu saldo e põe na caixinha; <em>Resgatar</em> devolve. Os
            centavos guardados a cada registro também saem do saldo na hora. Nada disso é gasto
            nem ganho — saldo + caixinhas continua o mesmo total.
          </p>
          <p>
            <strong className="text-text">Corrigir o valor</strong> (em editar) é pra quando a
            caixinha rendeu ou o banco mostra outro número: muda só a caixinha, não o saldo.
          </p>
        </div>
      </details>
    </div>
  );
}

function ItemCaixinha({
  caixinha,
  onEditar,
  onAjustarSaldo,
  onAlternarAtiva,
  onRemover,
  onTransferir,
  cdi,
}: {
  caixinha: Caixinha;
  onTransferir: (id: string, direcao: "guardar" | "resgatar", valor: number, chave: string) => Promise<boolean>;
  cdi: InfoCdi | null;
  onEditar: (
    id: string,
    dados: { nome: string; porGasto: number; meta?: number; percentualCdi?: number }
  ) => Promise<boolean>;
  onAjustarSaldo: (id: string, novoSaldo: number) => Promise<boolean>;
  onAlternarAtiva: (id: string) => Promise<boolean>;
  onRemover: (id: string) => Promise<boolean>;
}) {
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [movendo, setMovendo] = useState<"guardar" | "resgatar" | null>(null);
  const [valorMov, setValorMov] = useState(0);
  const [chaveMov, setChaveMov] = useState("");
  const [nome, setNome] = useState(caixinha.nome);
  const [porGasto, setPorGasto] = useState(caixinha.porGasto);
  const [meta, setMeta] = useState(caixinha.meta ?? 0);
  const [saldo, setSaldo] = useState(caixinha.saldo);
  const [percentualCdi, setPercentualCdi] = useState(String(caixinha.percentualCdi ?? 0));
  const toast = useToast();
  const pctCdi = caixinha.percentualCdi ?? 0;
  const estimativa = cdi ? estimarRendimentoMensal(caixinha.saldo, cdi.taxaDiaria, pctCdi) : 0;

  const progresso = progressoDaMeta(caixinha);
  const falta = faltaParaMeta(caixinha);
  const gastosRestantes = gastosAteAMeta(caixinha);

  function salvar() {
    const nomeAparado = nome.trim();
    if (!nomeAparado || porGasto < 0) return;
    toast.sucessoSe(
      onEditar(caixinha.id, {
        nome: nomeAparado,
        porGasto,
        meta: meta || undefined,
        percentualCdi: Number(percentualCdi) || 0,
      }),
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
            <label className="rotulo">Corrigir valor (não mexe no saldo)</label>
            <MoneyInput value={saldo} onChange={setSaldo} className="campo" />
          </div>
          <div>
            <label className="rotulo">Guarda a cada registro</label>
            <MoneyInput
              value={porGasto}
              onChange={setPorGasto}
              className="campo"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="rotulo">Meta (0 = sem meta)</label>
            <MoneyInput value={meta} onChange={setMeta} className="campo" />
          </div>
          <div>
            <label className="rotulo">Rende % do CDI</label>
            <input
              inputMode="numeric"
              value={percentualCdi}
              onChange={(e) => setPercentualCdi(e.target.value.replace(/\D/g, ""))}
              className="campo"
            />
          </div>
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
              setPercentualCdi(String(caixinha.percentualCdi ?? 0));
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
              <span className="ml-2 text-xs font-normal text-text-faint">
                pausada
              </span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-text-faint">
            {pctCdi > 0 ? `rende ${pctCdi}% do CDI` : "sem rendimento configurado"}
            {estimativa > 0 && ` · ~${formatarMoeda(estimativa)}/mês (estimativa)`}
          </p>
          <p className="text-xs text-text-faint">
            {!caixinha.ativa
              ? "depósito por registro pausado"
              : caixinha.porGasto > 0
              ? `+${formatarMoeda(caixinha.porGasto)} a cada gasto`
              : "sem depósito por registro"}
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
          <p className="mt-1 text-xs text-text-faint">
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

      <div className="mt-2.5 flex gap-2">
        <Botao
          tamanho="pequeno"
          variante="secundario"
          onClick={() => {
            setValorMov(0);
            setChaveMov(crypto.randomUUID());
            setMovendo("guardar");
          }}
        >
          Guardar
        </Botao>
        <Botao
          tamanho="pequeno"
          variante="secundario"
          disabled={caixinha.saldo <= 0}
          onClick={() => {
            setValorMov(0);
            setChaveMov(crypto.randomUUID());
            setMovendo("resgatar");
          }}
        >
          Resgatar
        </Botao>
      </div>

      {movendo && (
        <Dialogo
          aberto
          titulo={movendo === "guardar" ? `Guardar em "${caixinha.nome}"` : `Resgatar de "${caixinha.nome}"`}
          descricao={
            movendo === "guardar"
              ? "Sai do seu saldo e vai pra caixinha. Não é gasto."
              : `Volta pro seu saldo. Não é ganho. Disponível na caixinha: ${formatarMoeda(caixinha.saldo)}.`
          }
          onFechar={() => setMovendo(null)}
        >
          <label htmlFor={`mov-${caixinha.id}`} className="rotulo">
            Valor
          </label>
          <MoneyInput id={`mov-${caixinha.id}`} value={valorMov} onChange={setValorMov} className="campo" />
          {valorMov > 0 && (
            <p className="mt-2 text-xs text-text-muted">
              A caixinha fica com{" "}
              {formatarMoeda(movendo === "guardar" ? caixinha.saldo + valorMov : caixinha.saldo - valorMov)}.
            </p>
          )}
          <div className="mt-3 flex gap-2">
            <Botao
              larguraTotal
              disabled={valorMov <= 0}
              onClick={async () => {
                // mesma chave enquanto a janela está aberta: confirmar duas vezes grava uma
                const ok = await onTransferir(caixinha.id, movendo, valorMov, chaveMov);
                if (ok) {
                  toast.sucesso(movendo === "guardar" ? "Guardado." : "Resgatado: voltou pro saldo.");
                  setMovendo(null);
                }
              }}
            >
              {movendo === "guardar" ? "Guardar" : "Resgatar"}
            </Botao>
            <Botao larguraTotal variante="secundario" onClick={() => setMovendo(null)}>
              Cancelar
            </Botao>
          </div>
        </Dialogo>
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
        descricao={
          caixinha.saldo > 0
            ? `"${caixinha.nome}" ainda tem ${formatarMoeda(caixinha.saldo)}. Resgate antes (o valor volta pro seu saldo) — excluir com dinheiro dentro faria ele sumir do controle.`
            : `"${caixinha.nome}" está vazia e sai da lista. O histórico de transferências continua.`
        }
        textoConfirmar="Excluir"
        perigo
        onConfirmar={() => {
          setConfirmando(false);
          if (caixinha.saldo > 0) return;
          toast.sucessoSe(onRemover(caixinha.id), "Caixinha excluída.");
        }}
        onCancelar={() => setConfirmando(false)}
      />
    </li>
  );
}
