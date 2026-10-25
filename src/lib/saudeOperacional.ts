/**
 * Saúde operacional, redigida (auditoria 25/10 A08/N12): separa "o
 * agendador rodou" de "as entregas foram aceitas", e diz o que fazer. Nada
 * de chave, endpoint, e-mail ou valor financeiro aqui.
 */

export interface ResumoExecucao {
  dia?: string;
  inicio?: number;
  fim?: number;
  status?: string;
  usuarios?: number;
  aceitas?: number;
  falhas?: number;
  incidentesConfiguracao?: number;
}

export interface EntradaSaude {
  agora: number;
  ultimaExecucao: ResumoExecucao | null;
  /** Entregas pendentes (até o limite consultado). */
  pendentes: number;
  /** Pendente mais antiga com tentativa já vencida (ms), ou null. */
  pendenteMaisAntigaEm: number | null;
  /** Recursos com configuração válida (de diagnosticarAmbiente). */
  recursosAtivos: string[];
  bloqueiosDeAmbiente: string[];
}

export type Gravidade = "ok" | "atencao" | "incidente";

export interface Saude {
  geral: Gravidade;
  agendador: { estado: Gravidade; ultimaExecucaoHa: string | null; detalhe: string };
  entregas: { estado: Gravidade; pendentes: number; atrasoMaisAntigo: string | null; detalhe: string };
  configuracao: { estado: Gravidade; detalhe: string[] };
}

const HORA = 3_600_000;

function duracao(ms: number): string {
  if (ms < HORA) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (ms < 48 * HORA) return `${Math.round(ms / HORA)} h`;
  return `${Math.round(ms / (24 * HORA))} dias`;
}

const pior = (...g: Gravidade[]): Gravidade =>
  g.includes("incidente") ? "incidente" : g.includes("atencao") ? "atencao" : "ok";

export function avaliarSaude(e: EntradaSaude): Saude {
  // agendador: roda 1x por dia; sem batida em 26 h = não está rodando
  let agendador: Saude["agendador"];
  const ultima = e.ultimaExecucao;
  if (!ultima?.inicio) {
    agendador = { estado: "incidente", ultimaExecucaoHa: null, detalhe: "Nenhuma execução registrada." };
  } else {
    const ha = e.agora - ultima.inicio;
    const travada = ultima.status === "rodando" && ha > HORA;
    agendador = {
      estado: ha > 26 * HORA || travada ? "incidente" : ultima.status === "com_problemas" ? "atencao" : "ok",
      ultimaExecucaoHa: duracao(ha),
      detalhe: travada
        ? "A última execução começou e não terminou (tempo esgotado ou erro)."
        : ha > 26 * HORA
          ? "O agendador não roda há mais de um dia: confira o cron na Vercel."
          : ultima.status === "com_problemas"
            ? `Última execução com problemas: ${ultima.falhas ?? 0} falha(s), ${ultima.incidentesConfiguracao ?? 0} incidente(s) de configuração.`
            : `Última execução ok: ${ultima.usuarios ?? 0} usuário(s), ${ultima.aceitas ?? 0} entrega(s) aceita(s) pelo provedor.`,
    };
  }

  // entregas: pendente vencida há mais de 1 h = fila parada
  const atraso = e.pendenteMaisAntigaEm !== null ? e.agora - e.pendenteMaisAntigaEm : null;
  const entregas: Saude["entregas"] = {
    estado: atraso !== null && atraso > 6 * HORA ? "incidente" : atraso !== null && atraso > HORA ? "atencao" : "ok",
    pendentes: e.pendentes,
    atrasoMaisAntigo: atraso !== null ? duracao(atraso) : null,
    detalhe:
      e.pendentes === 0
        ? "Nenhuma entrega pendente."
        : `${e.pendentes} pendente(s)${atraso !== null ? `, a mais antiga vencida há ${duracao(atraso)}` : ""}. "Aceita" quer dizer que o provedor de push recebeu — não que apareceu na tela.`,
  };

  const detalhesConfig = [
    ...e.bloqueiosDeAmbiente,
    ...(e.recursosAtivos.includes("push") ? [] : ["Push desligado: chaves VAPID ausentes ou inválidas."]),
    ...(e.recursosAtivos.includes("notificações agendadas") ? [] : ["CRON_SECRET ausente ou curto: o agendador não autentica."]),
  ];
  const configuracao: Saude["configuracao"] = {
    estado: e.bloqueiosDeAmbiente.length ? "incidente" : detalhesConfig.length ? "atencao" : "ok",
    detalhe: detalhesConfig.length ? detalhesConfig : ["Configuração completa."],
  };

  return { geral: pior(agendador.estado, entregas.estado, configuracao.estado), agendador, entregas, configuracao };
}
