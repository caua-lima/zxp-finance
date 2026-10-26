import { createHash } from "crypto";
import { diagnosticarAmbiente } from "@/lib/configAmbiente";
import webpush from "web-push";
import {
  listarDocumentos,
  obterDocumento,
  obterComVersao,
  criarSeNaoExiste,
  consultar,
  gravarJuntas,
  gravarJuntasComVersao,
  Escrita,
} from "@/lib/firestoreRest";
import { decisaoDeAcesso } from "@/lib/acesso/servidor";
import {
  endpointPushValido,
  chavesPushValidas,
  decidirAposEnvio,
  idEntrega,
  payloadPush,
  tipoPermitido,
  PreferenciasNotificacao,
  TipoNotificacao,
  ConteudoNotificacao,
} from "./regras";
import { Evento } from "./eventos";

/**
 * Parte de servidor das notificações (auditoria N01–N08 e 25/10 E33–E40).
 * Tudo que escreve aqui está em coleções que o navegador só lê.
 *
 *   usuarios/{uid}/pushInscricoes/{aparelho}   aparelho cadastrado (com geração)
 *   pushAparelhos/{aparelho}                   índice global: aparelho → dono, geração
 *   usuarios/{uid}/notificacoes/{id}           central (inbox) — durável
 *   usuarios/{uid}/entregas/{id__aparelho}     tentativa de push por aparelho
 *
 * Garantias (e limites honestos):
 *  - aviso e entregas nascem JUNTOS (commit único); se algo faltou, a
 *    próxima execução repara (E33);
 *  - uma entrega só é enviada por quem a PEGOU (lease com prazo e
 *    pré-condição de versão); finalizar exige que ninguém tenha mexido
 *    depois (fencing). Se o provedor aceitar e a gravação falhar, o push
 *    pode repetir — a `tag` estável faz o navegador substituir em vez de
 *    empilhar (E34);
 *  - antes de enviar, relê dono e geração do aparelho, preferência,
 *    concessão de acesso e se a conta já foi paga (E36/E40).
 */

export const MAX_APARELHOS = 10;
/** Quanto tempo uma entrega fica "presa" a quem a pegou. */
export const LEASE_MS = 90_000;

export interface Inscricao {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  criadoEm: number;
  geracao: number;
  vapid: string;
}

/** Aparelho alvo de um aviso: id + a geração do cadastro naquele momento. */
export interface AparelhoAlvo {
  id: string;
  geracao?: number;
}

/** Id opaco do aparelho: hash do endpoint (o endpoint em si não sai do servidor). */
export function idAparelho(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

function assinaturaVapid(): string {
  return createHash("sha256")
    .update(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "")
    .digest("hex")
    .slice(0, 12);
}

/**
 * Prepara o web-push. Falso quando falta chave OU ela está em formato
 * inválido (antes, chave malformada estourava exceção no meio do cron).
 * O motivo, sem o valor, está em diagnosticarAmbiente().
 */
export function configurarVapid(): boolean {
  if (!diagnosticarAmbiente(process.env).recursosAtivos.includes("push")) return false;
  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    );
    return true;
  } catch {
    return false;
  }
}

export type ResultadoCadastro =
  | { ok: true; aparelho: string; geracao: number }
  | { ok: false; erro: string; status: 400 | 409 };

/**
 * Cadastra o aparelho pro usuário autenticado. Um aparelho tem UM dono: o
 * índice, a inscrição nova e a remoção da inscrição do dono anterior são
 * gravados JUNTOS, com pré-condição na versão do índice (E35). Duas contas
 * cadastrando o mesmo navegador ao mesmo tempo: uma vence, a outra relê e
 * refaz — nunca sobram duas inscrições pro mesmo aparelho.
 */
export async function cadastrarAparelho(
  uid: string,
  endpoint: unknown,
  keys: unknown
): Promise<ResultadoCadastro> {
  if (!endpointPushValido(endpoint)) {
    return { ok: false, erro: "Endereço de push não reconhecido.", status: 400 };
  }
  if (!chavesPushValidas(keys)) return { ok: false, erro: "Chaves de push inválidas.", status: 400 };
  const aparelho = idAparelho(endpoint as string);

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const indice = await obterComVersao<{ uid: string; geracao?: number }>(`pushAparelhos/${aparelho}`);
    const atuais = await listarDocumentos(`usuarios/${uid}/pushInscricoes`);
    if (!atuais.some((a) => a.id === aparelho) && atuais.length >= MAX_APARELHOS) {
      return { ok: false, erro: `Limite de ${MAX_APARELHOS} aparelhos. Desative um antes.`, status: 409 };
    }
    const geracao = Date.now() + tentativa;
    const escritas: Escrita[] = [];
    if (indice && indice.dados.uid !== uid) {
      escritas.push({ caminho: `usuarios/${indice.dados.uid}/pushInscricoes/${aparelho}`, apagar: true });
    }
    escritas.push({
      caminho: `usuarios/${uid}/pushInscricoes/${aparelho}`,
      dados: { endpoint, keys, criadoEm: Date.now(), geracao, vapid: assinaturaVapid() },
    });
    escritas.push({
      caminho: `pushAparelhos/${aparelho}`,
      dados: { uid, em: Date.now(), geracao },
      condicao: indice ? { versao: indice.versao } : { existe: false },
    });
    if ((await gravarJuntas(escritas)) === "ok") return { ok: true, aparelho, geracao };
  }
  return { ok: false, erro: "O aparelho está sendo ativado em outra sessão agora. Tente de novo.", status: 409 };
}

/**
 * Remove o vínculo do aparelho, junto com o índice e com pré-condição de
 * versão (E35). Aceita pelo dono (uid) OU por quem tem o endpoint na mão
 * (o próprio navegador provando posse). Com `geracao`, uma revogação
 * ATRASADA (de uma sessão antiga) não derruba um cadastro mais novo.
 */
export async function revogarAparelho(aparelho: string, uidDono?: string, geracao?: number): Promise<boolean> {
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const indice = await obterComVersao<{ uid: string; geracao?: number }>(`pushAparelhos/${aparelho}`);
    const dono = indice?.dados.uid;
    if (uidDono && dono && dono !== uidDono) return false;
    if (geracao !== undefined && indice?.dados.geracao !== undefined && indice.dados.geracao !== geracao) return false;
    const alvo = dono ?? uidDono;
    const escritas: Escrita[] = [];
    if (alvo) escritas.push({ caminho: `usuarios/${alvo}/pushInscricoes/${aparelho}`, apagar: true });
    if (indice) escritas.push({ caminho: `pushAparelhos/${aparelho}`, apagar: true, condicao: { versao: indice.versao } });
    if (escritas.length === 0) return true;
    if ((await gravarJuntas(escritas)) === "ok") return true;
  }
  return false;
}

export async function aparelhoVinculado(uid: string, aparelho: string): Promise<boolean> {
  const doc = await obterDocumento(`usuarios/${uid}/pushInscricoes/${aparelho}`);
  return doc !== null;
}

/** Aparelhos atuais do usuário, com a geração de cada cadastro. */
export async function aparelhosDoUsuario(uid: string): Promise<AparelhoAlvo[]> {
  return (await listarDocumentos<Inscricao>(`usuarios/${uid}/pushInscricoes`)).map((a) => ({
    id: a.id,
    geracao: a.dados.geracao,
  }));
}

export interface Contadores {
  eventos: number;
  notificacoesCriadas: number;
  entregasCriadas: number;
  entregasReparadas: number;
  tentativas: number;
  aceitas: number;
  reagendadas: number;
  falhas: number;
  expiradas: number;
  inscricoesEncerradas: number;
  incidentesConfig: number;
  /** Outra execução pegou a entrega antes (ou depois do prazo): não enviamos de novo. */
  leasesPerdidos: number;
  /** Conta já paga, preferência desligada, aparelho trocado ou acesso suspenso. */
  descartadas: number;
}

export function contadoresZerados(): Contadores {
  return {
    eventos: 0,
    notificacoesCriadas: 0,
    entregasCriadas: 0,
    entregasReparadas: 0,
    tentativas: 0,
    aceitas: 0,
    reagendadas: 0,
    falhas: 0,
    expiradas: 0,
    inscricoesEncerradas: 0,
    incidentesConfig: 0,
    leasesPerdidos: 0,
    descartadas: 0,
  };
}

function normalizarAlvos(aparelhos: (string | AparelhoAlvo)[]): AparelhoAlvo[] {
  return aparelhos.map((a) => (typeof a === "string" ? { id: a } : a));
}

function dadosDaEntrega(e: Evento, alvo: AparelhoAlvo) {
  return {
    notificacaoId: e.id,
    aparelho: alvo.id,
    ...(alvo.geracao !== undefined ? { geracao: alvo.geracao } : {}),
    tipo: e.tipo,
    status: "pendente",
    tentativas: 0,
    proximaTentativaEm: 0,
    validoAte: e.validoAte,
    ...(e.pagamentoId ? { pagamentoId: e.pagamentoId } : {}),
    criadaEm: Date.now(),
  };
}

/**
 * Grava os eventos na central e cria as entregas NUM COMMIT SÓ (E33):
 * nunca existe aviso sem as entregas dele por causa de uma queda no meio.
 * Id determinístico + "só se não existe": rodar de novo não duplica nem
 * reenvia. Se o aviso já existia (reexecução), REPARA entrega que faltou
 * pros aparelhos-alvo dele, enquanto o aviso ainda vale.
 */
export async function materializar(
  uid: string,
  eventos: Evento[],
  aparelhos: (string | AparelhoAlvo)[],
  prefs: PreferenciasNotificacao,
  c: Contadores,
  agora = Date.now()
): Promise<void> {
  const alvos = normalizarAlvos(aparelhos);
  for (const e of eventos) {
    if (!tipoPermitido(e.tipo, prefs)) continue;
    c.eventos++;
    const caminhoNotif = `usuarios/${uid}/notificacoes/${e.id}`;
    const escritas: Escrita[] = [
      {
        caminho: caminhoNotif,
        dados: {
          tipo: e.tipo,
          titulo: e.conteudo.titulo,
          corpo: e.conteudo.corpo,
          url: e.conteudo.url,
          diaLocal: e.diaLocal,
          validoAte: e.validoAte,
          estimado: !!e.estimado,
          aparelhosAlvo: alvos.map((a) => a.id),
          ...(e.pagamentoId ? { pagamentoId: e.pagamentoId } : {}),
          criadaEm: Date.now(),
        },
        condicao: { existe: false },
      },
      ...alvos.map((a) => ({
        caminho: `usuarios/${uid}/entregas/${idEntrega(e.id, a.id)}`,
        dados: dadosDaEntrega(e, a),
        condicao: { existe: false } as const,
      })),
    ];
    if ((await gravarJuntas(escritas)) === "ok") {
      c.notificacoesCriadas++;
      c.entregasCriadas += alvos.length;
      continue;
    }

    // já existia: repara o que faltou (queda entre aviso e entrega, versão
    // antiga que gravava separado), só pros alvos do aviso e só se ele vale
    const existente = await obterDocumento<{ aparelhosAlvo?: string[]; validoAte?: number }>(caminhoNotif);
    if (!existente) {
      // conflito numa entrega órfã sem aviso: cria o aviso sozinho
      if (await criarSeNaoExiste(caminhoNotif, (escritas[0] as { dados: Record<string, unknown> }).dados)) c.notificacoesCriadas++;
      continue;
    }
    if ((existente.validoAte ?? 0) <= agora || !existente.aparelhosAlvo) continue;
    for (const a of alvos.filter((x) => existente.aparelhosAlvo!.includes(x.id))) {
      if (await criarSeNaoExiste(`usuarios/${uid}/entregas/${idEntrega(e.id, a.id)}`, dadosDaEntrega(e, a))) {
        c.entregasReparadas++;
      }
    }
  }
}

interface EntregaDoc {
  notificacaoId: string;
  aparelho: string;
  geracao?: number;
  tipo: TipoNotificacao;
  status: string;
  tentativas: number;
  proximaTentativaEm: number;
  validoAte: number;
  leaseAte?: number;
  pagamentoId?: string;
}

interface NotificacaoDoc extends ConteudoNotificacao {
  tipo: TipoNotificacao;
}

async function enviarUmPush(
  inscricao: Inscricao,
  payload: string,
  ttlSeg: number
): Promise<{ status: number | null; retryAfter: number | null }> {
  try {
    const r = await webpush.sendNotification(
      { endpoint: inscricao.endpoint, keys: inscricao.keys },
      payload,
      { TTL: Math.max(60, ttlSeg), urgency: "normal", timeout: 10_000 }
    );
    return { status: r.statusCode, retryAfter: null };
  } catch (e) {
    const erro = e as { statusCode?: number; headers?: Record<string, string> };
    const ra = erro.headers?.["retry-after"];
    return { status: erro.statusCode ?? null, retryAfter: ra ? Number(ra) || null : null };
  }
}

/** Entregas do usuário que estão na vez: pendentes vencidas e leases abandonados (E39). */
async function entregasNaVez(uid: string, agora: number) {
  const candidatas = await consultar<EntregaDoc>({
    colecao: "entregas",
    dentroDe: `usuarios/${uid}`,
    onde: [["status", "in", ["pendente", "processando"]]],
    limite: 300,
  });
  return candidatas.filter((e) =>
    e.dados.status === "pendente"
      ? (e.dados.proximaTentativaEm ?? 0) <= agora
      : (e.dados.leaseAte ?? 0) <= agora
  );
}

/** Preferência LIDA AGORA (E36): desligar no meio do dia vale pra próxima entrega. */
async function preferenciasAtuais(uid: string, base: PreferenciasNotificacao): Promise<PreferenciasNotificacao> {
  const doc = await obterDocumento<Partial<PreferenciasNotificacao>>(`usuarios/${uid}/preferencias/notificacoes`);
  if (!doc) return base;
  return { ...base, ...Object.fromEntries(Object.entries(doc).filter(([, v]) => typeof v === "boolean")) };
}

/**
 * Processa as entregas na vez do usuário. Para cada uma:
 *  1. PEGA (lease de LEASE_MS com pré-condição de versão) — se outra
 *     execução pegou antes, pula (E34);
 *  2. RELÊ dono e geração do aparelho, preferência, concessão de acesso e
 *     se a conta já foi paga — qualquer mudança descarta (E36/E40);
 *  3. ENVIA e FINALIZA exigindo a versão do lease (fencing).
 * Entrega vencida expira sem envio. "Aceita" = o provedor recebeu, não
 * "apareceu na tela".
 */
export async function processarEntregas(
  uid: string,
  prefs: PreferenciasNotificacao,
  agora: number,
  c: Contadores,
  execucao = `avulsa__${agora}`
): Promise<{ incidenteConfig: boolean }> {
  const entregas = await entregasNaVez(uid, agora);
  if (entregas.length === 0) return { incidenteConfig: false };

  for (const { caminho } of entregas) {
    // 1. pega a entrega (relida agora, com versão)
    const lida = await obterComVersao<EntregaDoc>(caminho);
    if (!lida) continue;
    const e = lida.dados;
    const naVez =
      e.status === "pendente" ? (e.proximaTentativaEm ?? 0) <= agora : e.status === "processando" && (e.leaseAte ?? 0) <= agora;
    if (!naVez) continue;

    if (e.validoAte <= agora) {
      if ((await gravarJuntas([{ caminho, dados: { status: "expirada", atualizadaEm: agora }, campos: ["status", "atualizadaEm"], condicao: { versao: lida.versao } }])) === "ok") {
        c.expiradas++;
      }
      continue;
    }
    const lease = await gravarJuntasComVersao([
      {
        caminho,
        dados: { status: "processando", leaseAte: agora + LEASE_MS, leaseDono: execucao, atualizadaEm: agora },
        campos: ["status", "leaseAte", "leaseDono", "atualizadaEm"],
        condicao: { versao: lida.versao },
      },
    ]);
    if (!lease.ok) {
      c.leasesPerdidos++;
      continue;
    }
    const versaoLease = lease.versoes[0];
    const finalizar = async (dados: Record<string, unknown>) => {
      const r = await gravarJuntas([
        { caminho, dados: { ...dados, leaseAte: 0, atualizadaEm: Date.now() }, campos: [...Object.keys(dados), "leaseAte", "atualizadaEm"], condicao: { versao: versaoLease } },
      ]);
      if (r === "conflito") c.leasesPerdidos++;
      return r === "ok";
    };

    // 2. revalida tudo agora, não no começo do lote
    const [indice, inscricao, prefsAgora, acesso, notif, pago] = await Promise.all([
      obterDocumento<{ uid: string; geracao?: number }>(`pushAparelhos/${e.aparelho}`),
      obterDocumento<Inscricao>(`usuarios/${uid}/pushInscricoes/${e.aparelho}`),
      preferenciasAtuais(uid, prefs),
      decisaoDeAcesso(uid, agora),
      obterDocumento<NotificacaoDoc>(`usuarios/${uid}/notificacoes/${e.notificacaoId}`),
      e.pagamentoId ? obterDocumento(`usuarios/${uid}/pagamentos/${e.pagamentoId}`) : Promise.resolve(null),
    ]);
    const motivo = !inscricao
      ? "aparelho desvinculado"
      : indice?.uid !== uid
        ? "aparelho de outra conta"
        : !tipoPermitido(e.tipo, prefsAgora)
            ? "preferência desligada"
            : !acesso.liberado
              ? "acesso suspenso"
              : !notif
                ? "aviso removido"
                : pago
                  ? "conta já paga"
                  : null;
    if (motivo) {
      if (await finalizar({ status: "descartada", motivo })) c.descartadas++;
      continue;
    }

    // 3. envia e finaliza com a versão do lease
    const tentativas = (e.tentativas ?? 0) + 1;
    c.tentativas++;
    const { status, retryAfter } = await enviarUmPush(
      inscricao!,
      payloadPush(e.notificacaoId, e.tipo, notif!, prefsAgora.detalhesNoPush),
      Math.floor((e.validoAte - agora) / 1000)
    );
    const decisao = decidirAposEnvio(status, tentativas, agora, retryAfter);
    // erro normalizado: só o código, nunca endpoint ou chave
    const base = { tentativas, ultimoStatus: status };
    switch (decisao.acao) {
      case "aceita":
        if (await finalizar({ ...base, status: "aceita" })) c.aceitas++;
        break;
      case "encerrar_inscricao":
        if (await finalizar({ ...base, status: "falhou" })) {
          await revogarAparelho(e.aparelho, uid, e.geracao);
          c.inscricoesEncerradas++;
          c.falhas++;
        }
        break;
      case "retentar":
        if (await finalizar({ ...base, status: "pendente", proximaTentativaEm: decisao.proximaTentativaEm })) c.reagendadas++;
        break;
      case "incidente_config":
        // chave VAPID errada: para o lote do usuário sem apagar inscrição
        await finalizar({ ...base, status: "pendente", proximaTentativaEm: agora + 3_600_000 });
        c.incidentesConfig++;
        return { incidenteConfig: true };
      case "desistir":
        if (await finalizar({ ...base, status: "falhou" })) c.falhas++;
        break;
    }
  }
  return { incidenteConfig: false };
}

/**
 * Usuários com entrega na vez, em TODO o app (collection group, indexado):
 * pendente com tentativa vencida ou lease abandonado. É o que o executor
 * frequente processa — retentativa de minutos não espera o cron do dia
 * seguinte (auditoria 25/10 E37/N03).
 */
export async function usuariosComEntregaNaVez(agora: number, limite = 500): Promise<string[]> {
  const docs = await consultar<{ status: string; proximaTentativaEm?: number; leaseAte?: number }>({
    colecao: "entregas",
    todas: true,
    onde: [["status", "in", ["pendente", "processando"]]],
    limite,
  });
  const uids = new Set<string>();
  for (const d of docs) {
    const naVez = d.dados.status === "pendente" ? (d.dados.proximaTentativaEm ?? 0) <= agora : (d.dados.leaseAte ?? 0) <= agora;
    const uid = d.caminho.match(/^usuarios\/([^/]+)\/entregas\//)?.[1];
    if (naVez && uid) uids.add(uid);
  }
  return [...uids];
}
