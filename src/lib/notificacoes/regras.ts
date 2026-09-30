/**
 * Regras puras do sistema de notificações (auditoria N01–N08). Nada aqui
 * faz rede — o cron e as rotas de push só executam o que isto decide.
 *
 * Modelo: cada aviso vira uma NOTIFICAÇÃO durável na central do app
 * (inbox), com id determinístico; cada notificação × aparelho vira uma
 * ENTREGA, com tentativas e retry. Push é só um canal: se falhar, o aviso
 * continua na central.
 */

export type TipoNotificacao =
  | "saldo_diario"
  | "saldo_desatualizado"
  | "vencimento"
  | "ritmo"
  | "comissao"
  | "checklist"
  | "teste";

/** Categorias que você liga/desliga nas preferências. */
export type CategoriaPreferencia = "saldoDiario" | "vencimentos" | "ritmo" | "comissao" | "checklist";

export const CATEGORIA_DO_TIPO: Record<TipoNotificacao, CategoriaPreferencia | null> = {
  saldo_diario: "saldoDiario",
  saldo_desatualizado: "saldoDiario",
  vencimento: "vencimentos",
  ritmo: "ritmo",
  comissao: "comissao",
  checklist: "checklist",
  teste: null,
};

export interface PreferenciasNotificacao {
  saldoDiario: boolean;
  vencimentos: boolean;
  ritmo: boolean;
  /** Opt-in: só pra quem usa o módulo de comissões. */
  comissao: boolean;
  checklist: boolean;
  /** Mostrar valores no push (tela bloqueada). Padrão: não. */
  detalhesNoPush: boolean;
}

export function preferenciasPadrao(usaComissoes: boolean): PreferenciasNotificacao {
  return {
    saldoDiario: true,
    vencimentos: true,
    ritmo: true,
    comissao: usaComissoes,
    checklist: true,
    detalhesNoPush: false,
  };
}

export function tipoPermitido(tipo: TipoNotificacao, prefs: PreferenciasNotificacao): boolean {
  const categoria = CATEGORIA_DO_TIPO[tipo];
  return categoria === null || prefs[categoria];
}

/**
 * Id determinístico da notificação: (tipo, origem, ocorrência, marco).
 * Gerar o mesmo evento de novo — cron duplicado, reexecução, catch-up —
 * cai no mesmo id e não cria outra (auditoria N03).
 */
export function idNotificacao(
  tipo: TipoNotificacao,
  origemId: string,
  ocorrencia: string,
  marco = ""
): string {
  const limpo = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "-");
  return [tipo, limpo(origemId), limpo(ocorrencia), limpo(marco)].filter(Boolean).join("__").slice(0, 400);
}

export function idEntrega(notificacaoId: string, aparelhoId: string): string {
  return `${notificacaoId}__${aparelhoId.slice(0, 32)}`;
}

/**
 * Marco do aviso de vencimento, com recuperação de execução perdida
 * (auditoria N05): em vez de só avisar se hoje for EXATAMENTE 5, 1 ou 0
 * dias antes, o marco é a faixa em que o vencimento está. Se o cron não
 * rodou no dia 5, o aviso "vence em breve" sai no dia 4 — e não sai de
 * novo no dia 3, porque o id (com o marco) já existe.
 */
export function marcoDeVencimento(diasAte: number): "5" | "1" | "0" | null {
  if (diasAte === 0) return "0";
  if (diasAte === 1) return "1";
  if (diasAte >= 2 && diasAte <= 5) return "5";
  return null;
}

export type DecisaoEntrega =
  | { acao: "aceita" }
  | { acao: "encerrar_inscricao" }
  | { acao: "retentar"; proximaTentativaEm: number }
  | { acao: "incidente_config" }
  | { acao: "desistir" };

export const TENTATIVAS_MAXIMAS = 5;

/**
 * O que fazer depois de uma tentativa de envio (auditoria N03):
 * - 2xx: aceita pelo provedor (não é o mesmo que "exibida" — isso o app não sabe)
 * - 404/410: inscrição morreu, encerra
 * - 429: espera o Retry-After
 * - 5xx/rede: tenta de novo com espera crescente + aleatoriedade (jitter)
 * - 401/403: chave VAPID errada — incidente de configuração, NÃO apaga
 *   inscrição de ninguém (antes, erro de config poderia ser tratado como
 *   inscrição expirada em massa)
 */
export function decidirAposEnvio(
  status: number | null,
  tentativas: number,
  agoraMs: number,
  retryAfterSeg: number | null = null,
  aleatorio: () => number = Math.random
): DecisaoEntrega {
  if (status !== null && status >= 200 && status < 300) return { acao: "aceita" };
  if (status === 404 || status === 410) return { acao: "encerrar_inscricao" };
  if (status === 401 || status === 403) return { acao: "incidente_config" };
  if (tentativas >= TENTATIVAS_MAXIMAS) return { acao: "desistir" };
  if (status === 429 && retryAfterSeg !== null && retryAfterSeg > 0) {
    return { acao: "retentar", proximaTentativaEm: agoraMs + retryAfterSeg * 1000 };
  }
  if (status === null || status === 429 || status >= 500) {
    const base = 60_000 * Math.pow(4, tentativas - 1); // 1min, 4min, 16min, ~1h
    const jitter = base * 0.3 * aleatorio();
    return { acao: "retentar", proximaTentativaEm: agoraMs + base + jitter };
  }
  return { acao: "desistir" };
}

/** Rotas do app que um clique em notificação pode abrir (auditoria N07). */
export const ROTAS_DE_NOTIFICACAO = [
  "/",
  "/saldo",
  "/fatura",
  "/checklist",
  "/comissoes",
  "/notificacoes",
] as const;

/** Só caminho relativo e rota conhecida; qualquer outra coisa vira a central. */
export function rotaSegura(url: unknown): string {
  if (typeof url !== "string" || !url.startsWith("/") || url.startsWith("//")) return "/notificacoes";
  const caminho = url.split(/[?#]/)[0];
  return (ROTAS_DE_NOTIFICACAO as readonly string[]).includes(caminho) ? caminho : "/notificacoes";
}

/**
 * Provedores de push aceitos no cadastro (auditoria S08). O servidor faz
 * requisição pro endpoint informado — aceitar qualquer URL permitiria
 * usar o app pra bater em endereço interno (SSRF).
 */
const HOSTS_PUSH = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^([a-z0-9-]+\.)*push\.apple\.com$/,
  /^([a-z0-9-]+\.)*notify\.windows\.com$/,
  /^([a-z0-9-]+\.)*push\.services\.mozilla\.com$/,
];

export function endpointPushValido(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  return HOSTS_PUSH.some((re) => re.test(url.hostname));
}

/** Chaves de inscrição: base64url, tamanhos plausíveis. */
export function chavesPushValidas(keys: unknown): keys is { p256dh: string; auth: string } {
  if (!keys || typeof keys !== "object") return false;
  const k = keys as Record<string, unknown>;
  const b64 = /^[A-Za-z0-9_-]+={0,2}$/;
  return (
    typeof k.p256dh === "string" &&
    typeof k.auth === "string" &&
    b64.test(k.p256dh) &&
    b64.test(k.auth) &&
    k.p256dh.length >= 40 &&
    k.p256dh.length <= 200 &&
    k.auth.length >= 10 &&
    k.auth.length <= 100
  );
}

export interface ConteudoNotificacao {
  titulo: string;
  corpo: string;
  url: string;
}

const RESUMO_GENERICO: Record<TipoNotificacao, string> = {
  saldo_diario: "Seu resumo de hoje está pronto.",
  saldo_desatualizado: "Seu saldo precisa ser atualizado.",
  vencimento: "Tem conta vencendo. Toque pra ver.",
  ritmo: "Um alerta sobre o ritmo dos seus gastos.",
  comissao: "Lembrete sobre suas comissões.",
  checklist: "Lembrete das contas do mês.",
  teste: "Notificação de teste: este aparelho está recebendo.",
};

/**
 * O que vai no push, visível na tela bloqueada. Padrão discreto, sem
 * valores (auditoria N07) — o detalhe fica na central do app, que exige
 * login. Com `detalhesNoPush`, manda o texto completo.
 */
export function payloadPush(
  notificacaoId: string,
  tipo: TipoNotificacao,
  conteudo: ConteudoNotificacao,
  detalhes: boolean
): string {
  return JSON.stringify({
    id: notificacaoId,
    title: detalhes ? conteudo.titulo : "ZXP Finance",
    body: detalhes ? conteudo.corpo : RESUMO_GENERICO[tipo],
    url: rotaSegura(detalhes ? conteudo.url : "/notificacoes"),
  });
}

/** Até quando o aviso ainda é útil — "hoje" não pode chegar amanhã (N03). */
export function fimDoDia(diaISO: string): number {
  // 23:59:59 em Brasília (UTC−3)
  return new Date(`${diaISO}T23:59:59-03:00`).getTime();
}
