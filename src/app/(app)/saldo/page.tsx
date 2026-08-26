"use client";

import { FormEvent, useMemo, useState } from "react";
import { formatarMoeda, mesPadrao, Gasto } from "@/lib/types";
import {
  CATEGORIAS_GASTO,
  iconeCategoriaGasto,
  inferirCategoriaGasto,
} from "@/lib/categoriasGasto";
import { parseGastoTexto } from "@/lib/parseGastoTexto";
import { useSaldo } from "@/lib/useSaldo";
import { useGastos } from "@/lib/useGastos";
import { useConciliacoes } from "@/lib/useConciliacoes";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ConferirSaldoModal } from "@/components/ConferirSaldoModal";
import { useToast } from "@/components/Toast";
import { SkeletonLista } from "@/components/Skeleton";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/PageHeader";
import { Botao } from "@/components/Botao";
import { BotaoIcone, AcoesItem } from "@/components/BotaoIcone";
import { IconEditar, IconExcluir, IconEstornar } from "@/components/icons";
import {
  diasRestantesNoMes,
  calculateGastavelPorDia,
  calculateGastoDoDia,
  hojeISO,
} from "@/lib/finance/calculations";
import { projetarRitmo } from "@/lib/finance/ritmo";
import { avaliarDiasFechados, resumirConquistas } from "@/lib/finance/conquistas";
import { usePushNotifications } from "@/lib/usePushNotifications";
import { useMonthClose } from "@/lib/useMonthClose";

function agruparPorCategoria(gastos: Gasto[]) {
  const grupos = new Map<string, Gasto[]>();
  for (const g of gastos) {
    const lista = grupos.get(g.categoria) ?? [];
    lista.push(g);
    grupos.set(g.categoria, lista);
  }
  const ordem = CATEGORIAS_GASTO as readonly string[];
  return [...grupos.entries()].sort(
    (a, b) => ordem.indexOf(a[0]) - ordem.indexOf(b[0])
  );
}

export default function SaldoPage() {
  const {
    saldo,
    loading: loadingSaldo,
    erro: erroSaldo,
    definir,
    definirReservaMeta,
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
  const conciliacoes = useConciliacoes();
  const toast = useToast();
  const push = usePushNotifications();
  const monthClose = useMonthClose(mesPadrao());

  const [texto, setTexto] = useState("");
  const [ultimoRegistro, setUltimoRegistro] = useState<string | null>(null);
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null);
  const [definindoInicial, setDefinindoInicial] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [conferindo, setConferindo] = useState(false);
  const [editandoReserva, setEditandoReserva] = useState(false);
  const [novaReserva, setNovaReserva] = useState(0);

  const mes = mesPadrao();
  const loading = loadingSaldo || loadingGastos;
  const erro = erroSaldo || erroGastos || conciliacoes.erro;

  const gastosDoMes = useMemo(
    () => gastos.filter((g) => g.mes === mes),
    [gastos, mes]
  );
  const totalDoMes = gastosDoMes.reduce((acc, g) => acc + g.valor, 0);
  const grupos = useMemo(() => agruparPorCategoria(gastosDoMes), [gastosDoMes]);

  const gastosDesdeReferencia = saldo
    ? gastos.filter((g) => g.criadoEm > saldo.atualizadoEm)
    : [];
  const saldoAtual = saldo
    ? saldo.valor - gastosDesdeReferencia.reduce((acc, g) => acc + g.valor, 0)
    : null;

  const hoje = hojeISO();
  const reservaMeta = saldo?.reservaMeta ?? 0;
  const diasRestantes = diasRestantesNoMes(hoje);
  const gastavelPorDia = calculateGastavelPorDia(saldoAtual, reservaMeta, diasRestantes);

  const totalGastoHoje = calculateGastoDoDia(gastos, hoje);
  const aindaPodeGastarHoje = gastavelPorDia === null ? null : gastavelPorDia - totalGastoHoje;

  // "Previsão de chegada": onde o ritmo já praticado neste mês te deixa no
  // dia 30. O orçamento diário sozinho não avisa que dá pra estourar um
  // pouquinho todo dia e só descobrir isso no dia 25. Sem useMemo de
  // propósito — é um filter + reduce sobre os gastos do mês, e o compilador
  // do React memoiza sozinho.
  const projecao = projetarRitmo(saldoAtual, reservaMeta, gastos, mes, hoje);

  // O lado positivo: dias fechados dentro do orçamento e quanto isso já
  // sobrou. Antes o app só falava quando algo dava errado.
  const diasAvaliados =
    gastavelPorDia !== null
      ? avaliarDiasFechados(gastos, gastavelPorDia, mes, hoje)
      : [];
  const conquistas =
    gastavelPorDia !== null ? resumirConquistas(diasAvaliados, gastavelPorDia) : null;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const frase = texto.trim();
    if (!frase) return;

    const interpretado = parseGastoTexto(frase);
    if (!interpretado.valor || !interpretado.descricao) {
      setAvisoParcial(
        'Não consegui entender direito. Tenta algo como "Gastei 100 reais de gasolina".'
      );
      setUltimoRegistro(null);
      return;
    }

    const categoria = inferirCategoriaGasto(interpretado.descricao);
    setTexto("");
    setAvisoParcial(null);
    adicionar(interpretado.descricao, interpretado.valor, categoria).catch(
      console.error
    );
    setUltimoRegistro(
      `${formatarMoeda(interpretado.valor)} · ${interpretado.descricao} · ${iconeCategoriaGasto(categoria)} ${categoria}`
    );
  }

  function abrirEdicaoReserva() {
    setNovaReserva(reservaMeta);
    setEditandoReserva(true);
  }

  function salvarReserva() {
    definirReservaMeta(novaReserva);
    setEditandoReserva(false);
    toast.sucesso("Meta de reserva atualizada.");
  }

  function salvarSaldoInicial() {
    definir(saldoInicial);
    setDefinindoInicial(false);
  }

  return (
    <div>
      <PageHeader
        titulo="Saldo e gastos"
        descricao="Registre o que gastou e veja quanto ainda dá pra gastar hoje"
      />
      <ErroBanner mensagem={erro} />

      {/* PRIMEIRO USO — sem saldo não existe orçamento diário */}
      {saldo === null ? (
        <div className="rounded-2xl border border-brand/25 bg-surface-elevated p-5 mb-4">
          <p className="text-sm font-medium">Comece informando quanto você tem</p>
          <p className="mt-1 mb-3 text-xs text-text-faint">
            Depois de pagar as contas do mês, coloque aqui o que sobrou na conta.
            É desse valor que sai o quanto você pode gastar por dia.
          </p>
          {definindoInicial ? (
            <div className="space-y-2">
              <MoneyInput
                value={saldoInicial}
                onChange={setSaldoInicial}
                className="campo text-center text-lg font-semibold"
              />
              <div className="flex gap-2">
                <Botao onClick={salvarSaldoInicial} larguraTotal>
                  Salvar
                </Botao>
                <Botao
                  onClick={() => setDefinindoInicial(false)}
                  variante="secundario"
                  larguraTotal
                >
                  Cancelar
                </Botao>
              </div>
            </div>
          ) : (
            <Botao onClick={() => setDefinindoInicial(true)} larguraTotal>
              Definir saldo
            </Botao>
          )}
        </div>
      ) : (
        /* DESTAQUE — é o número que importa no dia a dia */
        <div className="rounded-2xl border border-brand/25 bg-surface-elevated p-5 mb-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-text-faint">
            Ainda posso gastar hoje
          </p>
          <p
            className={`mt-1 text-4xl font-bold tracking-tight ${
              aindaPodeGastarHoje === null
                ? "text-text-faint"
                : aindaPodeGastarHoje >= 0
                ? "text-brand"
                : "text-negative"
            }`}
          >
            {aindaPodeGastarHoje === null ? "—" : formatarMoeda(aindaPodeGastarHoje)}
          </p>

          {gastavelPorDia !== null && gastavelPorDia > 0 && (
            <>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full transition-all ${
                    totalGastoHoje > gastavelPorDia ? "bg-negative" : "bg-brand"
                  }`}
                  style={{
                    width: `${Math.min(100, Math.max(0, (totalGastoHoje / gastavelPorDia) * 100))}%`,
                  }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-[11px] text-text-faint">
                <span>Já gastei {formatarMoeda(totalGastoHoje)}</span>
                <span>Meta do dia {formatarMoeda(gastavelPorDia)}</span>
              </div>
            </>
          )}

          {/* previsão de chegada — para onde o ritmo atual te leva */}
          {projecao && (
            <div className="mt-3 border-t border-line-soft pt-3">
              {projecao.diaQueZera ? (
                <p className="text-xs font-medium text-negative">
                  ⚠ No seu ritmo, o dinheiro acaba dia{" "}
                  {projecao.diaQueZera.split("-")[2]}
                </p>
              ) : projecao.batendoMeta ? (
                <p className="text-xs font-medium text-positive">
                  ✓ No seu ritmo, o mês fecha com{" "}
                  {formatarMoeda(projecao.sobraProjetada)}
                </p>
              ) : (
                <p className="text-xs font-medium text-gold">
                  ⚠ No seu ritmo, sobra {formatarMoeda(projecao.sobraProjetada)} —{" "}
                  {formatarMoeda(reservaMeta - projecao.sobraProjetada)} abaixo da
                  sua meta
                </p>
              )}
              <p className="mt-1 text-[11px] text-text-faint">
                Média de {formatarMoeda(projecao.gastoMedioDiario)}/dia até aqui ·{" "}
                {diasRestantes} dia{diasRestantes === 1 ? "" : "s"} restante
                {diasRestantes === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>
      )}

      {saldo !== null && saldoAtual !== null && (
        <ConferirSaldoModal
          aberto={conferindo}
          saldoEsperado={saldoAtual}
          onRegistrar={async (params) => {
            const resultado = await conciliacoes.registrar(params);
            if (!resultado) return;
            if (resultado.diferenca === 0) toast.sucesso("Saldo conferido — bate certinho.");
            else if (resultado.ajusteCriado) toast.sucesso("Ajuste de conciliação registrado.");
            else toast.sucesso("Conferência adiada — nada foi alterado.");
          }}
          onFechar={() => setConferindo(false)}
        />
      )}

      {/* CONQUISTAS — só aparece quando há o que comemorar de verdade */}
      {conquistas && conquistas.diasFechados > 0 && (
        <div className="mb-3 rounded-2xl border border-positive/25 bg-positive-soft/40 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-positive">
                {conquistas.sequencia >= 2
                  ? `${conquistas.sequencia} dias seguidos no controle`
                  : `${conquistas.diasNoControle} de ${conquistas.diasFechados} dias no controle`}
              </p>
              <p className="mt-0.5 text-[11px] text-text-faint">
                {conquistas.economiaAcumulada > 0
                  ? `Você já economizou ${formatarMoeda(conquistas.economiaAcumulada)} em relação ao seu limite diário`
                  : "Dia fechado gastando menos que o limite conta como um dia no controle"}
              </p>
            </div>
            {conquistas.sequencia >= 3 && (
              <span className="shrink-0 text-2xl" aria-hidden="true">
                🔥
              </span>
            )}
          </div>

          {/* pontinhos: um por dia fechado do mês */}
          {conquistas.diasFechados <= 31 && (
            <div className="mt-3 flex flex-wrap gap-1" aria-hidden="true">
              {diasAvaliados.map((d) => (
                <span
                  key={d.dia}
                  title={`Dia ${d.dia.split("-")[2]}: ${formatarMoeda(d.gasto)}`}
                  className={`h-2 w-2 rounded-full ${
                    d.dentroDoOrcamento ? "bg-positive" : "bg-negative/50"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* REGISTRO RÁPIDO — é a ação mais frequente da tela, fica logo abaixo do número */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-3 mb-3"
      >
        <label htmlFor="saldo-form-texto" className="rotulo px-1">
          Registrar um gasto
        </label>
        <div className="flex gap-2">
          <input
            id="saldo-form-texto"
            placeholder='Ex: "Gastei 100 de gasolina"'
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="campo flex-1"
          />
          <Botao type="submit" className="shrink-0 px-5">
            Salvar
          </Botao>
        </div>
      </form>

      {/* SALDO, META E NOTIFICAÇÃO */}
      {saldo !== null && (
        <div className="rounded-2xl border border-line bg-surface p-4 mb-3">
          {editandoReserva ? (
            <div className="space-y-2">
              <label className="rotulo">
                Quanto você quer que sobre até o fim do mês?
              </label>
              <MoneyInput
                value={novaReserva}
                onChange={setNovaReserva}
                className="campo"
              />
              <div className="flex gap-2">
                <Botao onClick={salvarReserva} larguraTotal>
                  Salvar meta
                </Botao>
                <Botao
                  onClick={() => setEditandoReserva(false)}
                  variante="secundario"
                  larguraTotal
                >
                  Cancelar
                </Botao>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Saldo agora</span>
                <span
                  className={`text-base font-semibold ${
                    saldoAtual !== null && saldoAtual >= 0 ? "text-text" : "text-negative"
                  }`}
                >
                  {saldoAtual === null ? "—" : formatarMoeda(saldoAtual)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-text-muted">Quero que sobre</span>
                <button
                  onClick={abrirEdicaoReserva}
                  className="rounded-lg px-2 py-1 text-sm font-medium text-brand active:bg-surface-2"
                >
                  {reservaMeta > 0 ? formatarMoeda(reservaMeta) : "definir →"}
                </button>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-2.5">
                <span className="text-[11px] text-text-faint">
                  Conferido em{" "}
                  {new Date(saldo.atualizadoEm).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
                <Botao
                  onClick={() => setConferindo(true)}
                  variante="secundario"
                  tamanho="pequeno"
                >
                  Conferir saldo
                </Botao>
              </div>
              {push.suportado && (
                <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-2.5">
                  <span className="text-[11px] text-text-faint">
                    Aviso diário no celular
                    {push.permissao === "denied" && " · bloqueado no navegador"}
                  </span>
                  <button
                    onClick={() => {
                      if (push.ativo) {
                        push.desativar().then(() => toast.sucesso("Notificação desativada."));
                      } else {
                        push.ativar().then(() => {
                          if (push.permissao !== "denied") toast.sucesso("Notificação diária ativada.");
                        });
                      }
                    }}
                    disabled={push.carregando || push.permissao === "denied"}
                    className={`shrink-0 rounded-lg px-2 py-1 text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed ${
                      push.ativo ? "text-negative" : "text-brand"
                    }`}
                  >
                    {push.carregando ? "..." : push.ativo ? "Desativar" : "Ativar"}
                  </button>
                </div>
              )}
              {push.precisaInstalar && (
                <div className="border-t border-line-soft pt-2.5">
                  <p className="text-[11px] font-medium text-gold">
                    Pra receber aviso no celular, instale o app
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-text-faint">
                    No iPhone a notificação só funciona com o app na tela de
                    início. Toque em <strong>Compartilhar</strong> (o quadrado com
                    a seta pra cima) e depois em{" "}
                    <strong>Adicionar à Tela de Início</strong>. Abra por lá e o
                    botão de ativar aparece aqui.
                  </p>
                </div>
              )}
              {push.erro && <p className="text-xs text-negative">{push.erro}</p>}
            </div>
          )}
        </div>
      )}

      {ultimoRegistro && (
        <div className="mb-4 rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand">
          Registrado: {ultimoRegistro}
        </div>
      )}
      {avisoParcial && (
        <div className="mb-4 rounded-xl border border-gold/30 bg-gold-soft px-4 py-3 text-sm text-gold">
          {avisoParcial}
        </div>
      )}

      <div className="rounded-2xl border border-line bg-surface p-4 mb-6 flex justify-between items-center">
        <span className="text-sm text-text-muted">Total gasto no mês</span>
        <span className="text-lg font-semibold text-gold">
          {formatarMoeda(totalDoMes)}
        </span>
      </div>

      {monthClose.fechado && (
        <div className="mb-4 rounded-xl border border-line-soft bg-surface-2/50 px-4 py-3 text-xs text-text-faint">
          🔒 Mês fechado — estornar gasto deste mês fica bloqueado. Reabra na
          aba DRE pra corrigir algo.
        </div>
      )}

      {loading ? (
        <SkeletonLista linhas={4} />
      ) : gastosDoMes.length === 0 ? (
        <EmptyState mensagem="Nenhum gasto registrado neste mês." alvoId="saldo-form-texto" />
      ) : (
        <div className="space-y-5">
          {grupos.map(([categoria, itens]) => (
            <div key={categoria}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-sm font-medium text-text-muted">
                  {iconeCategoriaGasto(categoria)} {categoria}
                </h2>
                <span className="text-xs text-text-faint">
                  {formatarMoeda(itens.reduce((acc, g) => acc + g.valor, 0))}
                </span>
              </div>
              <ul className="space-y-2">
                {itens.map((g) => (
                  <ItemGasto
                    key={g.id}
                    gasto={g}
                    onEditar={editar}
                    onEstornar={estornar}
                    onRemover={remover}
                    mesFechado={monthClose.fechado}
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {conciliacoes.historico.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-medium text-text-muted mb-2">
            Histórico de conciliações
          </h2>
          <ul className="space-y-2">
            {conciliacoes.historico.slice(0, 10).map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-line bg-surface px-4 py-3 text-sm"
              >
                <div className="flex justify-between items-center">
                  <span className="text-text-muted">
                    {new Date(c.criadoEm).toLocaleDateString("pt-BR")}
                  </span>
                  <span
                    className={
                      c.diferenca === 0
                        ? "text-positive"
                        : c.diferenca > 0
                        ? "text-positive"
                        : "text-negative"
                    }
                  >
                    {c.diferenca === 0
                      ? "sem diferença"
                      : `${c.diferenca > 0 ? "+" : ""}${formatarMoeda(c.diferenca)}`}
                  </span>
                </div>
                <p className="text-xs text-text-faint mt-1">
                  informado {formatarMoeda(c.saldoInformado)} · esperado{" "}
                  {formatarMoeda(c.saldoEsperado)}
                  {c.ajusteCriado && " · ajuste criado"}
                  {c.responsavelEmail && ` · ${c.responsavelEmail}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ItemGasto({
  gasto,
  onEditar,
  onEstornar,
  onRemover,
  mesFechado,
}: {
  gasto: Gasto;
  onEditar: (
    id: string,
    dados: { descricao: string; valor: number; categoria: string }
  ) => void;
  onEstornar: (id: string, motivo: string) => void;
  onRemover: (id: string, motivo: string) => void;
  mesFechado?: boolean;
}) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);
  const [descricao, setDescricao] = useState(gasto.descricao);
  const [valor, setValor] = useState(gasto.valor);
  const [categoria, setCategoria] = useState(gasto.categoria);

  const ehEstorno = !!gasto.estornoDeId;
  const bloqueado = gasto.estornado || ehEstorno;

  function salvar() {
    const descAparada = descricao.trim();
    if (!descAparada || !valor) return;
    onEditar(gasto.id, { descricao: descAparada, valor, categoria });
    setEditando(false);
  }

  if (editando) {
    return (
      <li className="rounded-xl border border-brand/40 bg-surface p-4 space-y-3">
        <div>
          <label className="rotulo">Descrição</label>
          <input
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="campo"
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="rotulo">Valor</label>
            <MoneyInput value={valor} onChange={setValor} className="campo" />
          </div>
          <div>
            <label className="rotulo">Categoria</label>
            <select
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              className="campo"
            >
              {CATEGORIAS_GASTO.map((c) => (
                <option key={c} value={c}>
                  {iconeCategoriaGasto(c)} {c}
                </option>
              ))}
            </select>
          </div>
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
      className={`flex items-center gap-2 rounded-xl border pl-4 pr-2 py-2 ${
        bloqueado
          ? "border-line-soft bg-surface-2/50"
          : "border-line bg-surface"
      }`}
    >
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-sm ${
            gasto.estornado
              ? "line-through text-text-faint"
              : ehEstorno
              ? "italic text-text-faint"
              : ""
          }`}
        >
          {gasto.descricao}
        </p>
        {(gasto.estornado || ehEstorno) && (
          <span
            className={`text-[10px] uppercase tracking-wide ${
              gasto.estornado ? "text-negative" : "text-info"
            }`}
          >
            {gasto.estornado ? "estornado" : "estorno"}
          </span>
        )}
      </div>
      <span
        className={`shrink-0 text-sm font-medium ${
          gasto.valor < 0 ? "text-positive" : bloqueado ? "text-text-faint" : "text-gold"
        }`}
      >
        {formatarMoeda(gasto.valor)}
      </span>
      <AcoesItem>
        {!bloqueado && (
          <>
            <BotaoIcone label="Editar gasto" onClick={() => setEditando(true)}>
              <IconEditar width={17} height={17} />
            </BotaoIcone>
            <BotaoIcone
              label={
                mesFechado
                  ? "Mês fechado — reabra na aba DRE pra estornar"
                  : "Estornar (mantém no histórico e devolve o valor)"
              }
              onClick={() => setConfirmando(true)}
              disabled={mesFechado}
            >
              <IconEstornar width={17} height={17} />
            </BotaoIcone>
          </>
        )}
        <BotaoIcone
          label="Excluir gasto"
          tom="perigo"
          onClick={() => setConfirmandoExclusao(true)}
        >
          <IconExcluir width={17} height={17} />
        </BotaoIcone>
      </AcoesItem>

      <ConfirmModal
        aberto={confirmando}
        titulo="Estornar gasto"
        descricao={`"${gasto.descricao}" continua no histórico, mas um lançamento de estorno devolve ${formatarMoeda(gasto.valor)} pro seu saldo.`}
        textoConfirmar="Estornar"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          onEstornar(gasto.id, motivo ?? "");
          toast.sucesso("Gasto estornado.");
          setConfirmando(false);
        }}
        onCancelar={() => setConfirmando(false)}
      />

      <ConfirmModal
        aberto={confirmandoExclusao}
        titulo="Excluir definitivamente"
        descricao={
          bloqueado
            ? `"${gasto.estornado ? gasto.descricao : gasto.descricao.replace(/^Estorno: /, "")}" e o estorno dele serão apagados juntos, de vez — isso não pode ser desfeito. Como as duas metades já se cancelam, o saldo não muda.`
            : `"${gasto.descricao}" será apagado de vez — isso não pode ser desfeito. Se quer manter o histórico e só corrigir o saldo, use "Estornar" em vez de excluir.`
        }
        textoConfirmar="Excluir"
        perigo
        pedirMotivo
        onConfirmar={(motivo) => {
          onRemover(gasto.id, motivo ?? "");
          toast.sucesso(bloqueado ? "Par estorno/original excluído." : "Gasto excluído.");
          setConfirmandoExclusao(false);
        }}
        onCancelar={() => setConfirmandoExclusao(false)}
      />
    </li>
  );
}
