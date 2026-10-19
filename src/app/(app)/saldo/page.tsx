"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  formatarMoeda,
  formatarMes,
  mesPadrao,
  arredondarCentavos,
  contaNoPeriodo,
  Gasto,
} from "@/lib/types";
import {
  CATEGORIAS_GASTO,
  inferirCategoriaGasto,
} from "@/lib/categoriasGasto";
import { parseGastoTexto } from "@/lib/parseGastoTexto";
import { useSaldo } from "@/lib/useSaldo";
import { useGastos } from "@/lib/useGastos";
import { useCaixinhas } from "@/lib/useCaixinhas";
import { totalGuardado, totalPorGasto } from "@/lib/finance/caixinhas";
import { useReconhecimentoVoz } from "@/lib/useReconhecimentoVoz";
import { useCdi } from "@/lib/useCdi";
import { usePagamentos } from "@/lib/usePagamentos";
import { Dialogo } from "@/components/Dialogo";
import {
  saldoConfirmado,
  dataEfetivaDoGasto,
  gastoContaNoSaldo,
} from "@/lib/finance/saldo";
import { estimarRendimentoMensal } from "@/lib/finance/rendimento";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import { SkeletonLista } from "@/components/Skeleton";
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { IconMicrofone } from "@/components/icons";
import { hojeISO } from "@/lib/finance/calculations";
import { areaDaVida, celebracao, fraseDoDia } from "@/lib/abundancia";
import { useMonthClose } from "@/lib/useMonthClose";

const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function rotuloDoDia(dia: string, hoje: string): string {
  const [ano, mes, d] = dia.split("-").map(Number);
  const data = new Date(ano, mes - 1, d);
  const [aH, mH, dH] = hoje.split("-").map(Number);
  const diferenca = Math.round(
    (new Date(aH, mH - 1, dH).getTime() - data.getTime()) / 86400000
  );
  if (diferenca === 0) return "Hoje";
  if (diferenca === 1) return "Ontem";
  return `${DIAS_SEMANA[data.getDay()]}, ${String(d).padStart(2, "0")}/${String(mes).padStart(2, "0")}`;
}

interface Previa {
  chave: string;
  fraseOriginal: string;
  descricao: string;
  valor: number;
  categoria: string;
  data: string;
}

function diaMenos(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

/**
 * Prévia do lançamento: o que foi entendido, editável, antes de gravar.
 * Enter no campo de cima também confirma.
 */
function CartaoPrevia({
  previa,
  hoje,
  enviando,
  onMudar,
  onConfirmar,
  onCancelar,
}: {
  previa: Previa;
  hoje: string;
  enviando: boolean;
  onMudar: (p: Previa) => void;
  onConfirmar: () => void;
  onCancelar: () => void;
}) {
  const dias = [0, 1, 2].map((n) => diaMenos(hoje, n));
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-brand/40 bg-surface-2/40 p-3">
      <p className="text-xs font-medium text-text-muted">Confere antes de salvar:</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor="previa-valor" className="rotulo">
            Valor
          </label>
          <MoneyInput
            id="previa-valor"
            value={previa.valor}
            onChange={(valor) => onMudar({ ...previa, valor })}
            className="campo font-semibold"
          />
        </div>
        <div>
          <label htmlFor="previa-data" className="rotulo">
            Quando
          </label>
          <select
            id="previa-data"
            value={dias.includes(previa.data) ? previa.data : dias[0]}
            onChange={(e) => onMudar({ ...previa, data: e.target.value })}
            className="campo"
          >
            {dias.map((d) => (
              <option key={d} value={d}>
                {rotuloDoDia(d, hoje)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="previa-descricao" className="rotulo">
          Descrição
        </label>
        <input
          id="previa-descricao"
          value={previa.descricao}
          onChange={(e) => onMudar({ ...previa, descricao: e.target.value })}
          className="campo"
        />
      </div>
      <div>
        <label htmlFor="previa-categoria" className="rotulo">
          Categoria
        </label>
        <select
          id="previa-categoria"
          value={previa.categoria}
          onChange={(e) => onMudar({ ...previa, categoria: e.target.value })}
          className="campo"
        >
          {CATEGORIAS_GASTO.map((c) => (
            <option key={c} value={c}>
              {areaDaVida(c).icone} {areaDaVida(c).nome}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-text-muted">
        Gasto aqui = dinheiro que saiu da conta (Pix, débito). Compra no cartão de crédito entra
        pela fatura.
      </p>
      <div className="flex gap-2">
        <Botao
          onClick={onConfirmar}
          disabled={enviando || !previa.descricao.trim() || previa.valor <= 0}
          larguraTotal
        >
          {enviando ? "Salvando..." : "Confirmar"}
        </Botao>
        <Botao onClick={onCancelar} disabled={enviando} variante="secundario" larguraTotal>
          Voltar
        </Botao>
      </div>
    </div>
  );
}

/**
 * Tela do dia a dia: quanto tem na conta, o sinal do dia, e registrar o
 * que você investiu em você. Refeita pra ser só isso — antes tinha conquistas,
 * meta, notificação, histórico de conciliação e ajustes com sinal
 * invertido tudo empilhado na mesma coluna.
 */
export default function SaldoPage() {
  const {
    saldo,
    loading: loadingSaldo,
    erro: erroSaldo,
    atualizar,
    definirReservaMeta,
    definirPercentualCdi,
  } = useSaldo();
  const {
    gastos,
    loading: loadingGastos,
    erro: erroGastos,
    adicionar,
    editar,
    estornar,
    remover,
  } = useGastos();
  const { caixinhas } = useCaixinhas();
  const cdi = useCdi();
  const pagamentos = usePagamentos(mesPadrao());
  const toast = useToast();
  const monthClose = useMonthClose(mesPadrao());

  const [texto, setTexto] = useState("");
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [ultimoRegistro, setUltimoRegistro] = useState<string | null>(null);
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null);
  const [atualizandoSaldo, setAtualizandoSaldo] = useState(false);

  const mes = mesPadrao();
  const hoje = hojeISO();
  const loading = loadingSaldo || loadingGastos;
  const erro = erroSaldo || erroGastos;

  // Contrato único (docs/modelo-financeiro.md): saldo confirmado. O
  // "pode gastar hoje" saiu a pedido do dono (linguagem de abundância,
  // ver lib/abundancia.ts) — o cálculo continua em finance/saldo.ts.
  const saldoAtual = saldoConfirmado(saldo, gastos, pagamentos.movimentos);
  const reservaMeta = saldo?.reservaMeta ?? 0;
  // rendimento é só estimativa — nunca entra no saldo (auditoria F07)
  const percentualCdiSaldo = saldo?.percentualCdi ?? 0;
  const rendimentoEstimado =
    cdi.info && saldoAtual !== null
      ? estimarRendimentoMensal(saldoAtual, cdi.info.taxaDiaria, percentualCdiSaldo)
      : 0;
  const guardaPorGasto = totalPorGasto(caixinhas);

  // Ajuste de conciliação não é gasto (é correção de saldo antiga) — fica
  // fora da lista e do total. Com "Atualizar saldo" ele nem existe mais.
  const gastosDoMes = gastos.filter(
    (g) => g.mes === mes && !g.ajusteConciliacaoId && contaNoPeriodo(dataEfetivaDoGasto(g))
  );
  const totalDoMes = arredondarCentavos(
    gastosDoMes.reduce((acc, g) => acc + g.valor, 0)
  );
  const grupos = new Map<string, Gasto[]>();
  for (const g of gastosDoMes) {
    const dia = dataEfetivaDoGasto(g);
    grupos.set(dia, [...(grupos.get(dia) ?? []), g]);
  }
  const porDia = [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0]));

  /**
   * Texto ou voz viram uma PRÉVIA editável — nada é salvo sem você ver
   * valor, descrição, categoria e dia (auditoria F06/U05). A chave de
   * idempotência nasce com a prévia: confirmar duas vezes grava uma só.
   */
  function interpretar(frase: string) {
    const lido = parseGastoTexto(frase);
    if (!lido.valor || !lido.descricao) {
      setTexto(frase);
      setAvisoParcial('Não entendi o valor. Tenta assim: "25 almoço" ou "gastei 100 de gasolina".');
      setUltimoRegistro(null);
      return;
    }
    setAvisoParcial(null);
    setUltimoRegistro(null);
    setPrevia({
      chave: crypto.randomUUID(),
      fraseOriginal: frase,
      descricao: lido.descricao,
      valor: lido.valor,
      categoria: inferirCategoriaGasto(lido.descricao),
      data: diaMenos(hoje, lido.diasAtras),
    });
  }

  async function confirmarPrevia() {
    if (!previa || confirmando) return;
    setConfirmando(true);
    const ok = await adicionar(previa.descricao, previa.valor, previa.categoria, {
      data: previa.data,
      chave: previa.chave,
    });
    setConfirmando(false);
    if (!ok) return; // a prévia continua na tela: nada do que você digitou se perde
    setUltimoRegistro(
      `${formatarMoeda(previa.valor)} investido em ${areaDaVida(
        previa.categoria
      ).nome.toLowerCase()} · ${celebracao(previa.valor * 100)}${previa.data !== hoje ? ` · ${rotuloDoDia(previa.data, hoje).toLowerCase()}` : ""}` +
        (guardaPorGasto > 0 ? ` · 🐷 +${formatarMoeda(guardaPorGasto)}` : "")
    );
    setPrevia(null);
    setTexto("");
  }

  // depois de `interpretar` existir: a voz entrega a frase pra ela
  const voz = useReconhecimentoVoz(interpretar);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (previa) {
      confirmarPrevia();
      return;
    }
    const frase = texto.trim();
    if (frase) interpretar(frase);
  }

  return (
    <div>
      <PageHeader titulo="Saldo e gastos" />
      <ErroBanner mensagem={erro || voz.erro} />

      {loading ? (
        <SkeletonLista linhas={3} />
      ) : saldo === null ? (
        <PrimeiroSaldo onSalvar={(valor) => atualizar(valor, null)} />
      ) : (
        <div className="mb-3 rounded-2xl border border-brand/25 bg-surface-elevated p-4">
          {/* saldo na conta */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-[0.1em] text-text-faint">
                Na conta agora
              </p>
              <p
                className={`mt-0.5 text-2xl font-bold tracking-tight ${
                  saldoAtual !== null && saldoAtual < 0 ? "text-negative" : "text-text"
                }`}
              >
                {formatarMoeda(saldoAtual ?? 0)}
              </p>
              <p className="mt-0.5 text-xs text-text-faint">
                atualizado{" "}
                {new Date(saldo.atualizadoEm).toLocaleDateString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                })}
                {rendimentoEstimado > 0 && (
                  <span>
                    {" "}
                    · rende ~{formatarMoeda(rendimentoEstimado)}/mês (estimativa)
                  </span>
                )}
              </p>
            </div>
            <Botao onClick={() => setAtualizandoSaldo(true)} variante="secundario" tamanho="pequeno">
              Reajustar
            </Botao>
          </div>

          {/* sinal do dia + o que você já investiu em você no mês */}
          <div className="mt-4 border-t border-line-soft pt-4">
            <p className="text-sm italic leading-relaxed text-brand">“{fraseDoDia(hoje)}”</p>
            <p className="mt-2 text-xs text-text-muted">
              Investido em qualidade de vida em {formatarMes(mes).split(" ")[0].toLowerCase()}:{" "}
              <span className="font-semibold text-text">{formatarMoeda(totalDoMes)}</span>
            </p>
          </div>
        </div>
      )}

      {/* registrar — a ação mais frequente, logo abaixo do número */}
      <form onSubmit={handleSubmit} className="mb-4 rounded-2xl border border-line bg-surface p-3">
        <label htmlFor="saldo-form-texto" className="rotulo px-1">
          Investi em mim
        </label>
        <div className="flex gap-2">
          <input
            id="saldo-form-texto"
            placeholder={voz.ouvindo ? "Ouvindo..." : 'Ex: "25 almoço"'}
            value={voz.parcial || texto}
            onChange={(e) => {
              setTexto(e.target.value);
              if (previa) setPrevia(null);
            }}
            className="campo flex-1"
            autoComplete="off"
          />
          {voz.suportado && (
            <button
              type="button"
              onClick={voz.ouvindo ? voz.parar : voz.ouvir}
              aria-label={voz.ouvindo ? "Parar de ouvir" : "Falar o gasto"}
              className={`flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-xl border transition-colors md:h-[42px] md:w-[42px] ${
                voz.ouvindo
                  ? "animate-pulse border-negative bg-negative-soft text-negative"
                  : "border-line bg-surface-2 text-text-muted active:bg-surface"
              }`}
            >
              <IconMicrofone width={19} height={19} />
            </button>
          )}
          {!previa && (
            <Botao type="submit" className="shrink-0 px-4">
              Anotar
            </Botao>
          )}
        </div>
        {previa && (
          <CartaoPrevia
            previa={previa}
            hoje={hoje}
            enviando={confirmando}
            onMudar={setPrevia}
            onConfirmar={confirmarPrevia}
            onCancelar={() => {
              setTexto(previa.fraseOriginal);
              setPrevia(null);
            }}
          />
        )}
        {ultimoRegistro && !avisoParcial && !previa && (
          <p className="mt-2 px-1 text-xs text-positive" role="status">
            ✓ Salvo: {ultimoRegistro}
          </p>
        )}
        {avisoParcial && <p className="mt-2 px-1 text-xs text-gold">{avisoParcial}</p>}
      </form>

      {/* gastos do mês, por dia */}
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="text-sm font-medium text-text-muted">
          Investido em você em {formatarMes(mes).split(" ")[0].toLowerCase()}
        </h2>
        <span className="text-sm font-semibold text-gold">{formatarMoeda(totalDoMes)}</span>
      </div>

      {loading ? (
        <SkeletonLista linhas={4} />
      ) : porDia.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-text-faint">
          Nada registrado neste mês ainda. Cada registro é um voto na pessoa que cuida bem do próprio dinheiro.
        </p>
      ) : (
        <div className="space-y-4">
          {porDia.map(([dia, itens]) => (
            <div key={dia}>
              <div className="mb-1.5 flex items-center justify-between px-1 text-xs text-text-faint">
                <span>{rotuloDoDia(dia, hoje)}</span>
                <span>{formatarMoeda(itens.reduce((acc, g) => acc + g.valor, 0))}</span>
              </div>
              <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface">
                {itens.map((g) => (
                  <ItemGasto
                    key={g.id}
                    gasto={g}
                    onEditar={editar}
                    onEstornar={estornar}
                    onRemover={remover}
                    mesFechado={monthClose.fechado}
                    mudaSaldo={saldo ? gastoContaNoSaldo(g, saldo) : false}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {caixinhas.length > 0 && (
        <Link
          href="/caixinhas"
          className="mt-4 flex items-center justify-between rounded-2xl border border-line bg-surface px-4 py-3 text-sm active:bg-surface-2"
        >
          <span className="text-text-muted">🐷 Guardado nas caixinhas</span>
          <span className="font-medium text-positive">{formatarMoeda(totalGuardado(caixinhas))}</span>
        </Link>
      )}

      {saldo !== null && (
        <Configuracoes
          reservaMeta={reservaMeta}
          percentualCdi={saldo.percentualCdi ?? 100}
          cdiAnual={cdi.info?.anual ?? null}
          cdiData={cdi.info?.data ?? null}
          cdiStatus={cdi.status}
          onTentarCdi={cdi.tentarDeNovo}
          onSalvarReserva={(v) => toast.sucessoSe(definirReservaMeta(v), "Reserva atualizada.")}
          onSalvarCdi={(v) => toast.sucessoSe(definirPercentualCdi(v), "Rendimento atualizado.")}
        />
      )}

      {atualizandoSaldo && saldoAtual !== null && (
        <AtualizarSaldo
          saldoAtual={saldoAtual}
          onSalvar={async (valor, registrarDiferenca) => {
            const faltou = arredondarCentavos(saldoAtual - valor);
            const ok = await atualizar(valor, saldoAtual, registrarDiferenca);
            if (ok) {
              toast.sucesso(
                registrarDiferenca && faltou > 0
                  ? `Saldo em ${formatarMoeda(valor)}. ${formatarMoeda(faltou)} entrou como gasto não lançado.`
                  : valor === 0
                    ? "Saldo zerado."
                    : `Saldo atualizado pra ${formatarMoeda(valor)}.`
              );
              setAtualizandoSaldo(false);
            }
            return ok;
          }}
          onFechar={() => setAtualizandoSaldo(false)}
        />
      )}
    </div>
  );
}

function PrimeiroSaldo({ onSalvar }: { onSalvar: (valor: number) => Promise<boolean> }) {
  const [valor, setValor] = useState(0);
  const toast = useToast();
  return (
    <div className="mb-3 rounded-2xl border border-brand/25 bg-surface-elevated p-5">
      <p className="text-sm font-medium">Quanto você tem na conta agora?</p>
      <p className="mt-1 mb-3 text-xs text-text-faint">
        Pode ser zero.
      </p>
      <MoneyInput value={valor} onChange={setValor} className="campo text-center text-lg font-semibold" />
      <Botao
        onClick={() => toast.sucessoSe(onSalvar(valor), "Saldo definido.")}
        larguraTotal
        className="mt-2"
      >
        Salvar saldo
      </Botao>
    </div>
  );
}

/**
 * Atualizar saldo = o valor digitado vira o saldo, e ponto. Sem "ajuste
 * de conciliação", sem gasto negativo aparecendo na lista. "Zerar" é o
 * atalho pro caso de começar do zero.
 */
/**
 * Atualizar saldo = o valor digitado vira o saldo, e ponto. Sem "ajuste
 * de conciliação", sem gasto negativo na lista. Se salvar falhar, a janela
 * continua aberta com o valor digitado (auditoria U02).
 */
function AtualizarSaldo({
  saldoAtual,
  onSalvar,
  onFechar,
}: {
  saldoAtual: number;
  onSalvar: (valor: number, registrarDiferenca: boolean) => Promise<boolean>;
  onFechar: () => void;
}) {
  const [valor, setValor] = useState(Math.max(0, saldoAtual));
  const [registrar, setRegistrar] = useState(true);
  const [enviando, setEnviando] = useState(false);
  // positivo = saiu dinheiro que você não lançou; negativo = entrou a mais
  const faltou = arredondarCentavos(saldoAtual - valor);

  async function salvar(v: number, registrarDiferenca: boolean) {
    setEnviando(true);
    await onSalvar(v, registrarDiferenca);
    setEnviando(false);
  }

  return (
    <Dialogo
      aberto
      titulo="Reajustar saldo"
      descricao="Olhe no app do banco e digite o saldo disponível. Ele vira o seu saldo."
      onFechar={onFechar}
      bloqueado={enviando}
    >
      <p className="mb-3 flex justify-between rounded-xl bg-surface-2/60 px-3 py-2 text-sm">
        <span className="text-text-muted">O app calcula</span>
        <span className="font-medium text-text">{formatarMoeda(saldoAtual)}</span>
      </p>
      <label htmlFor="saldo-novo" className="rotulo">
        Saldo disponível no banco
      </label>
      <MoneyInput
        id="saldo-novo"
        value={valor}
        onChange={setValor}
        className="campo text-center text-lg font-semibold"
      />

      <div aria-live="polite" className="mt-3 text-sm">
        {faltou > 0 && (
          <>
            <p className="text-negative">
              Faltam {formatarMoeda(faltou)} em relação ao que o app calcula.
            </p>
            <label className="mt-2 flex cursor-pointer items-start gap-2.5 rounded-xl bg-surface-2/60 px-3 py-2.5 text-xs text-text-muted">
              <input
                type="checkbox"
                checked={registrar}
                onChange={(e) => setRegistrar(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
              />
              <span>
                Registrar {formatarMoeda(faltou)} como &quot;Gastos não lançados&quot; de hoje. Entra no
                total do mês e no relatório; o saldo não é descontado duas vezes.
              </span>
            </label>
          </>
        )}
        {faltou < 0 && (
          <p className="text-positive">
            Tem {formatarMoeda(-faltou)} a mais do que o app calcula (entrada que não estava
            lançada). O saldo sobe; nenhum gasto é criado.
          </p>
        )}
        {faltou === 0 && <p className="text-text-muted">Bate com o que o app calcula.</p>}
      </div>

      <div className="mt-3 flex gap-2">
        <Botao onClick={() => salvar(valor, registrar)} disabled={enviando} larguraTotal>
          {enviando ? "Salvando..." : "Salvar"}
        </Botao>
        <Botao onClick={onFechar} disabled={enviando} variante="secundario" larguraTotal>
          Cancelar
        </Botao>
      </div>
      <button
        type="button"
        onClick={() => salvar(0, false)}
        disabled={enviando}
        className="mt-3 w-full rounded-xl py-2 text-sm font-medium text-negative active:bg-negative-soft disabled:opacity-40"
      >
        Zerar saldo (sem registrar gasto)
      </button>
    </Dialogo>
  );
}

function Configuracoes({
  reservaMeta,
  percentualCdi,
  cdiAnual,
  cdiData,
  cdiStatus,
  onTentarCdi,
  onSalvarReserva,
  onSalvarCdi,
}: {
  reservaMeta: number;
  percentualCdi: number;
  cdiAnual: number | null;
  cdiData: string | null;
  cdiStatus: "carregando" | "ok" | "erro";
  onTentarCdi: () => void;
  onSalvarReserva: (v: number) => void;
  onSalvarCdi: (v: number) => void;
}) {
  const [reserva, setReserva] = useState(reservaMeta);
  const [cdi, setCdi] = useState(String(percentualCdi));
  const rendimentoAnual = cdiAnual !== null ? (cdiAnual * (Number(cdi) || 0)) / 100 : null;

  return (
    <details className="mt-6 rounded-2xl border border-line bg-surface px-4 py-3">
      <summary className="cursor-pointer text-sm text-text-muted">Configurações do saldo</summary>
      <div className="mt-3 space-y-4">
        <div>
          <label className="rotulo">Quero guardar no fim do mês</label>
          <div className="flex gap-2">
            <MoneyInput value={reserva} onChange={setReserva} className="campo flex-1" />
            <Botao
              onClick={() => onSalvarReserva(reserva)}
              disabled={reserva === reservaMeta}
              variante="secundario"
            >
              Salvar
            </Botao>
          </div>
          <p className="mt-1 text-xs text-text-faint">
            Sua meta de guardar no mês.
          </p>
        </div>

        <div>
          <label htmlFor="saldo-cdi" className="rotulo">
            A conta rende quanto do CDI? (%) — só pra estimativa
          </label>
          <div className="flex gap-2">
            <input
              id="saldo-cdi"
              inputMode="numeric"
              value={cdi}
              onChange={(e) => setCdi(e.target.value.replace(/\D/g, ""))}
              className="campo flex-1"
            />
            <Botao
              onClick={() => onSalvarCdi(Number(cdi) || 0)}
              disabled={Number(cdi) === percentualCdi}
              variante="secundario"
            >
              Salvar
            </Botao>
          </div>
          <p className="mt-1 text-xs text-text-muted">
            A conta do Mercado Pago diz render 100% do CDI. O app só mostra uma estimativa de
            quanto o saldo tende a render — ela nunca entra no saldo. O dinheiro que o banco
            creditar de verdade aparece quando você atualizar o saldo. 0 = sem estimativa.
          </p>
          <p className="mt-1 text-xs text-text-muted" role="status">
            {cdiStatus === "ok" && cdiAnual !== null && cdiData
              ? `Fonte: Banco Central (CDI de ${cdiData.split("-").reverse().join("/")}: ~${cdiAnual
                  .toFixed(2)
                  .replace(".", ",")}% ao ano).${
                  rendimentoAnual !== null && percentualCdi > 0
                    ? ` No seu percentual, ~${rendimentoAnual.toFixed(2).replace(".", ",")}% ao ano, bruto.`
                    : ""
                }`
              : cdiStatus === "carregando"
              ? "Buscando a taxa do CDI no Banco Central..."
              : null}
            {cdiStatus === "erro" && (
              <>
                Não consegui buscar o CDI no Banco Central.{" "}
                <button type="button" onClick={onTentarCdi} className="font-medium text-brand">
                  Tentar de novo
                </button>
              </>
            )}
          </p>
        </div>

        <Link
          href="/notificacoes"
          className="flex items-center justify-between rounded-xl bg-surface-2/60 px-3 py-3 text-sm text-text-muted active:bg-surface-2"
        >
          <span>Avisos no celular e preferências</span>
          <span className="text-brand">Notificações →</span>
        </Link>
      </div>
    </details>
  );
}

/**
 * Item da lista: só descrição e valor. Tocar abre as ações — antes eram
 * três ícones em cada linha, e a lista virava uma parede de botões.
 */
function ItemGasto({
  gasto,
  onEditar,
  onEstornar,
  onRemover,
  mesFechado,
  mudaSaldo,
}: {
  gasto: Gasto;
  onEditar: (
    id: string,
    dados: { descricao: string; valor: number; categoria: string }
  ) => Promise<boolean>;
  onEstornar: (id: string, motivo: string) => Promise<boolean>;
  onRemover: (id: string, motivo: string) => Promise<boolean>;
  mesFechado?: boolean;
  /** Esse gasto está descontado do saldo atual — apagar devolve o valor. */
  mudaSaldo?: boolean;
}) {
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [confirmandoEstorno, setConfirmandoEstorno] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [descricao, setDescricao] = useState(gasto.descricao);
  const [valor, setValor] = useState(gasto.valor);
  const [categoria, setCategoria] = useState(gasto.categoria);

  const ehEstorno = !!gasto.estornoDeId;
  const bloqueado = gasto.estornado || ehEstorno;

  function salvar() {
    const desc = descricao.trim();
    if (!desc || !valor) return;
    toast.sucessoSe(onEditar(gasto.id, { descricao: desc, valor, categoria }), "Gasto atualizado.");
    setEditando(false);
    setAberto(false);
  }

  if (editando) {
    return (
      <li className="space-y-2 bg-surface-2/40 p-3">
        <input value={descricao} onChange={(e) => setDescricao(e.target.value)} className="campo" />
        <div className="grid grid-cols-2 gap-2">
          <MoneyInput value={valor} onChange={setValor} className="campo" />
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="campo">
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>
                {areaDaVida(c).icone} {areaDaVida(c).nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <Botao onClick={salvar} larguraTotal tamanho="pequeno">
            Salvar
          </Botao>
          <Botao onClick={() => setEditando(false)} variante="secundario" larguraTotal tamanho="pequeno">
            Cancelar
          </Botao>
        </div>
      </li>
    );
  }

  return (
    <li>
      <button
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surface-2"
      >
        <span className="shrink-0 text-base" aria-hidden="true">
          {areaDaVida(gasto.categoria).icone}
        </span>
        <span
          className={`min-w-0 flex-1 truncate text-sm ${
            gasto.estornado ? "text-text-faint line-through" : ehEstorno ? "italic text-text-faint" : ""
          }`}
        >
          {gasto.descricao}
        </span>
        <span
          className={`shrink-0 text-sm font-medium ${
            gasto.valor < 0 ? "text-positive" : bloqueado ? "text-text-faint" : "text-text"
          }`}
        >
          {formatarMoeda(gasto.valor)}
        </span>
      </button>

      {aberto && (
        <div className="flex gap-2 px-3.5 pb-3">
          {!bloqueado && (
            <>
              <Botao onClick={() => setEditando(true)} variante="secundario" tamanho="pequeno">
                Editar
              </Botao>
              <Botao
                onClick={() => setConfirmandoEstorno(true)}
                disabled={mesFechado}
                variante="secundario"
                tamanho="pequeno"
              >
                Estornar
              </Botao>
            </>
          )}
          <Botao
            onClick={() => setConfirmandoExclusao(true)}
            variante="fantasma"
            tamanho="pequeno"
            className="text-negative!"
          >
            Excluir
          </Botao>
        </div>
      )}

      <ConfirmModal
        aberto={confirmandoEstorno}
        titulo="Estornar gasto"
        descricao={`"${gasto.descricao}" continua no histórico, mas um estorno devolve ${formatarMoeda(
          gasto.valor
        )} pro seu saldo. Use quando o dinheiro voltou (devolução, reembolso).`}
        textoConfirmar="Estornar"
        pedirMotivo
        onConfirmar={(motivo) => {
          toast.sucessoSe(onEstornar(gasto.id, motivo ?? ""), "Gasto estornado.");
          setConfirmandoEstorno(false);
          setAberto(false);
        }}
        onCancelar={() => setConfirmandoEstorno(false)}
      />

      <ConfirmModal
        aberto={confirmandoExclusao}
        titulo="Excluir gasto"
        descricao={
          bloqueado
            ? "Esse gasto e o estorno dele são apagados juntos. Como um cancela o outro, o saldo não muda."
            : `"${gasto.descricao}" some de vez — use quando lançou errado. ${
                mudaSaldo
                  ? `O saldo volta ${formatarMoeda(gasto.valor)}.`
                  : "O saldo não muda (esse gasto é de antes da última atualização de saldo)."
              } Se o dinheiro voltou de verdade, use Estornar.`
        }
        textoConfirmar="Excluir"
        perigo
        onConfirmar={() => {
          toast.sucessoSe(
            onRemover(gasto.id, "excluído na tela de saldo"),
            bloqueado ? "Gasto e estorno excluídos." : "Gasto excluído."
          );
          setConfirmandoExclusao(false);
        }}
        onCancelar={() => setConfirmandoExclusao(false)}
      />
    </li>
  );
}
