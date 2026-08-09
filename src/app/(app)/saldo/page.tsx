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
import { useFinanceDashboard } from "@/lib/finance/useFinanceDashboard";
import { MoneyInput } from "@/components/MoneyInput";
import { ErroBanner } from "@/components/ErroBanner";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ConferirSaldoModal } from "@/components/ConferirSaldoModal";
import { useToast } from "@/components/Toast";

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
  const { saldo, loading: loadingSaldo, erro: erroSaldo, definir } = useSaldo();
  const {
    gastos,
    loading: loadingGastos,
    erro: erroGastos,
    adicionar,
    editar,
    estornar,
  } = useGastos();
  const conciliacoes = useConciliacoes();
  const dash = useFinanceDashboard(mesPadrao());
  const toast = useToast();

  const [texto, setTexto] = useState("");
  const [ultimoRegistro, setUltimoRegistro] = useState<string | null>(null);
  const [avisoParcial, setAvisoParcial] = useState<string | null>(null);
  const [definindoInicial, setDefinindoInicial] = useState(false);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [conferindo, setConferindo] = useState(false);

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

  function salvarSaldoInicial() {
    definir(saldoInicial);
    setDefinindoInicial(false);
  }

  return (
    <div>
      <h1 className="text-lg font-semibold mb-1">Saldo e gastos</h1>
      <p className="text-xs text-text-faint mb-4">
        Mercado Pago · fale o que você gastou e o saldo já desconta sozinho
      </p>
      <ErroBanner mensagem={erro} />

      {/* SALDO */}
      {saldo === null ? (
        <div className="rounded-2xl border border-brand/25 bg-surface-elevated p-6 mb-6 text-center">
          <p className="text-sm text-text-muted mb-2">Saldo ainda não definido</p>
          {definindoInicial ? (
            <div className="flex items-center justify-center gap-2">
              <MoneyInput
                value={saldoInicial}
                onChange={setSaldoInicial}
                className="w-40 rounded-lg border border-line bg-surface-2 px-3 py-2 text-lg text-center outline-none focus:border-brand"
              />
              <button
                onClick={salvarSaldoInicial}
                className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
              >
                Salvar
              </button>
              <button
                onClick={() => setDefinindoInicial(false)}
                className="rounded-lg border border-line px-3 py-2 text-sm text-text-muted"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setDefinindoInicial(true)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
            >
              Definir saldo inicial
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-brand/25 bg-surface-elevated p-6 mb-6">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div>
              <p className="text-xs text-text-faint">Real informado</p>
              <p className="text-base font-semibold mt-1">{formatarMoeda(saldo.valor)}</p>
            </div>
            <div>
              <p className="text-xs text-text-faint">Calculado agora</p>
              <p
                className={`text-lg font-bold mt-1 ${
                  saldoAtual !== null && saldoAtual >= 0 ? "text-brand" : "text-negative"
                }`}
              >
                {saldoAtual === null ? "—" : formatarMoeda(saldoAtual)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-faint">Projetado (fim do mês)</p>
              <p
                className={`text-base font-semibold mt-1 ${
                  dash.saldoProjetado !== null && dash.saldoProjetado >= 0
                    ? "text-positive"
                    : "text-negative"
                }`}
              >
                {dash.loading || dash.saldoProjetado === null
                  ? "—"
                  : formatarMoeda(dash.saldoProjetado)}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-text-faint text-center mt-3">
            Última conferência: {new Date(saldo.atualizadoEm).toLocaleString("pt-BR")}
          </p>
          <div className="text-center mt-3">
            <button
              onClick={() => setConferindo(true)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
            >
              Conferir saldo
            </button>
          </div>
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

      {/* REGISTRO RÁPIDO */}
      <form
        onSubmit={handleSubmit}
        className="rounded-2xl border border-line bg-surface p-4 mb-3"
      >
        <div className="flex gap-2">
          <input
            placeholder='Ex: "Gastei 100 reais de gasolina"'
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            className="flex-1 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            type="submit"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-[#0E0F0C] hover:bg-brand-dark transition-colors"
          >
            Registrar
          </button>
        </div>
      </form>

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

      {loading ? (
        <p className="text-sm text-text-faint">Carregando...</p>
      ) : gastosDoMes.length === 0 ? (
        <p className="text-sm text-text-faint">
          Nenhum gasto registrado neste mês.
        </p>
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
}: {
  gasto: Gasto;
  onEditar: (
    id: string,
    dados: { descricao: string; valor: number; categoria: string }
  ) => void;
  onEstornar: (id: string, motivo: string) => void;
}) {
  const toast = useToast();
  const [editando, setEditando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
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
      <li className="rounded-xl border border-brand/40 bg-surface px-4 py-3 space-y-2">
        <input
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="w-full rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
        />
        <div className="grid grid-cols-2 gap-2">
          <MoneyInput
            value={valor}
            onChange={setValor}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          />
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-sm outline-none focus:border-brand"
          >
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>
                {iconeCategoriaGasto(c)} {c}
              </option>
            ))}
          </select>
        </div>
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
      className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 ${
        bloqueado
          ? "border-line-soft bg-surface-2/50"
          : "border-line bg-surface"
      }`}
    >
      <span
        className={`text-sm truncate ${
          gasto.estornado ? "line-through text-text-faint" : ehEstorno ? "italic text-text-faint" : ""
        }`}
      >
        {gasto.descricao}
        {gasto.estornado && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-negative">estornado</span>
        )}
        {ehEstorno && (
          <span className="ml-2 text-[10px] uppercase tracking-wide text-info">estorno</span>
        )}
      </span>
      <div className="flex items-center gap-3 shrink-0">
        <span
          className={`text-sm font-medium ${
            gasto.valor < 0 ? "text-positive" : bloqueado ? "text-text-faint" : "text-gold"
          }`}
        >
          {formatarMoeda(gasto.valor)}
        </span>
        {!bloqueado && (
          <>
            <button
              onClick={() => setEditando(true)}
              className="text-text-faint hover:text-brand text-sm"
              aria-label="Editar"
            >
              ✎
            </button>
            <button
              onClick={() => setConfirmando(true)}
              className="text-text-faint hover:text-negative text-sm"
              aria-label="Estornar"
            >
              ✕
            </button>
          </>
        )}
      </div>

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
    </li>
  );
}
