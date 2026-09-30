"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/PageHeader";
import { ErroBanner } from "@/components/ErroBanner";
import { Botao } from "@/components/Botao";
import { SkeletonLista } from "@/components/Skeleton";
import { useNotificacoes, usePreferenciasNotificacao } from "@/lib/useNotificacoes";
import { usePushNotifications, EstadoPush } from "@/lib/usePushNotifications";
import { useComissoes } from "@/lib/useComissoes";
import { mesPadrao } from "@/lib/types";
import { rotaSegura, PreferenciasNotificacao } from "@/lib/notificacoes/regras";

const TEXTO_ESTADO: Record<EstadoPush, { titulo: string; detalhe: string }> = {
  verificando: { titulo: "Verificando...", detalhe: "Conferindo este aparelho no servidor." },
  sem_suporte: {
    titulo: "Este navegador não recebe notificações",
    detalhe: "Os avisos continuam aparecendo aqui na central.",
  },
  precisa_instalar: {
    titulo: "Instale o app pra receber no iPhone",
    detalhe: "Toque em Compartilhar → Adicionar à Tela de Início e abra o app por lá. No iPhone, só o app instalado recebe push.",
  },
  negada: {
    titulo: "Bloqueado nas permissões do navegador",
    detalhe: "Libere as notificações deste site nos ajustes do navegador ou do celular e volte aqui.",
  },
  desligado: { titulo: "Desligado neste aparelho", detalhe: "Os avisos ficam só aqui na central." },
  registrando: { titulo: "Ativando...", detalhe: "Aceite o pedido de permissão, se aparecer." },
  vinculado: {
    titulo: "Ligado neste aparelho",
    detalhe: "Confirmado no servidor pra esta conta. Use o teste pra conferir se chega.",
  },
  erro: { titulo: "Algo deu errado", detalhe: "Tente de novo em instantes." },
};

const PREFERENCIAS: Array<{ chave: keyof PreferenciasNotificacao; titulo: string; detalhe: string }> = [
  { chave: "vencimentos", titulo: "Vencimentos", detalhe: "Faturas e contas: 5 dias antes, na véspera e no dia" },
  { chave: "saldoDiario", titulo: "Resumo do dia", detalhe: "Quanto dá pra gastar hoje (1 aviso por dia)" },
  { chave: "ritmo", titulo: "Ritmo de gastos", detalhe: "Quando o ritmo zera o dinheiro antes do fim do mês" },
  { chave: "checklist", titulo: "Contas do mês", detalhe: "Lembrete se nada foi marcado como pago até o dia 8" },
  { chave: "comissao", titulo: "Comissões", detalhe: "Lembrete de lançar o dia de trabalho" },
  {
    chave: "detalhesNoPush",
    titulo: "Mostrar valores no aviso",
    detalhe: "Desligado: a tela bloqueada só diz que há aviso novo, sem valores",
  },
];

/**
 * Central de notificações (auditoria N02/N06): o que chegou, o estado real
 * do push NESTE aparelho (confirmado no servidor, com botão de teste) e o
 * que você quer receber.
 */
export default function NotificacoesPage() {
  const central = useNotificacoes();
  const push = usePushNotifications();
  const comissoes = useComissoes(mesPadrao());
  const preferencias = usePreferenciasNotificacao(comissoes.todas.length > 0);
  const [resultadoTeste, setResultadoTeste] = useState<string | null>(null);
  const [testando, setTestando] = useState(false);

  const estado = TEXTO_ESTADO[push.estado];

  return (
    <div className="space-y-5">
      <PageHeader titulo="Notificações" descricao="Seus avisos, este aparelho e o que você quer receber" />
      <ErroBanner mensagem={central.erro || preferencias.erro || push.erro} />

      {/* este aparelho */}
      <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="aparelho-titulo">
        <h2 id="aparelho-titulo" className="text-sm font-semibold">
          Este aparelho
        </h2>
        <p
          className={`mt-1 text-sm font-medium ${
            push.estado === "vinculado" ? "text-positive" : push.estado === "erro" ? "text-negative" : "text-text"
          }`}
          role="status"
        >
          {estado.titulo}
        </p>
        <p className="mt-0.5 text-xs text-text-muted">{estado.detalhe}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(push.estado === "desligado" || push.estado === "erro") && (
            <Botao onClick={push.ativar} tamanho="pequeno">
              Ativar notificações
            </Botao>
          )}
          {push.estado === "vinculado" && (
            <>
              <Botao
                onClick={async () => {
                  setTestando(true);
                  setResultadoTeste(await push.testar());
                  setTestando(false);
                }}
                disabled={testando}
                tamanho="pequeno"
              >
                {testando ? "Enviando..." : "Testar este aparelho"}
              </Botao>
              <Botao onClick={push.desativar} variante="secundario" tamanho="pequeno">
                Desligar aqui
              </Botao>
            </>
          )}
        </div>
        {resultadoTeste && (
          <p className="mt-2 text-xs text-text-muted" role="status">
            {resultadoTeste}
          </p>
        )}
      </section>

      {/* central */}
      <section aria-labelledby="central-titulo">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 id="central-titulo" className="text-sm font-medium text-text-muted">
            Avisos {central.naoLidas > 0 && `· ${central.naoLidas} não lido${central.naoLidas === 1 ? "" : "s"}`}
          </h2>
          {central.naoLidas > 0 && (
            <button onClick={central.marcarTodasLidas} className="text-xs font-medium text-brand">
              Marcar todos como lidos
            </button>
          )}
        </div>
        {central.loading ? (
          <SkeletonLista linhas={3} />
        ) : central.itens.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-text-muted">
            Nenhum aviso ainda. Eles aparecem aqui mesmo que o push esteja desligado.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-surface">
            {central.itens.map((n) => (
              <li key={n.id}>
                <Link
                  href={rotaSegura(n.url)}
                  onClick={() => !n.lidaEm && central.marcarLida(n.id)}
                  className="flex gap-3 px-4 py-3 active:bg-surface-2"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.lidaEm ? "bg-transparent" : "bg-brand"}`}
                  />
                  <span className="min-w-0">
                    <span className={`block text-sm ${n.lidaEm ? "text-text-muted" : "font-medium text-text"}`}>
                      {n.titulo}
                      {!n.lidaEm && <span className="sr-only"> (não lido)</span>}
                    </span>
                    <span className="block text-xs text-text-muted">{n.corpo}</span>
                    <span className="mt-0.5 block text-xs text-text-muted">
                      {new Date(n.criadaEm).toLocaleString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {n.estimado && " · valor estimado"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* preferências */}
      <section className="rounded-2xl border border-line bg-surface p-4" aria-labelledby="prefs-titulo">
        <h2 id="prefs-titulo" className="text-sm font-semibold">
          O que você quer receber
        </h2>
        <ul className="mt-2 divide-y divide-line-soft">
          {PREFERENCIAS.map((p) => (
            <li key={p.chave}>
              <label className="flex min-h-[52px] cursor-pointer items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm">{p.titulo}</span>
                  <span className="block text-xs text-text-muted">{p.detalhe}</span>
                </span>
                <input
                  type="checkbox"
                  checked={preferencias.prefs[p.chave]}
                  disabled={!preferencias.carregado}
                  onChange={(e) => preferencias.alterar(p.chave, e.target.checked)}
                  className="h-5 w-5 shrink-0 accent-brand"
                />
              </label>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-text-muted">
          Os avisos são gerados uma vez por dia, de manhã (horário de Brasília). O push depende do celular
          estar online e do sistema não silenciar o app — o que não chegar fica aqui.
        </p>
      </section>
    </div>
  );
}
