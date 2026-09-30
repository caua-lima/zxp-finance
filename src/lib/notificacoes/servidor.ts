import { createHash } from "crypto";
import webpush from "web-push";
import {
  listarDocumentos,
  obterDocumento,
  criarSeNaoExiste,
  atualizarCampos,
  deletarDocumento,
} from "@/lib/firestoreRest";
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
 * Parte de servidor das notificações (auditoria N01–N08). Tudo que escreve
 * aqui está em coleções que o navegador só lê (ver firestore.rules).
 *
 *   usuarios/{uid}/pushInscricoes/{aparelho}   aparelho cadastrado
 *   pushAparelhos/{aparelho}                   índice global: aparelho → dono
 *   usuarios/{uid}/notificacoes/{id}           central (inbox) — durável
 *   usuarios/{uid}/entregas/{id__aparelho}     tentativa de push por aparelho
 */

export const MAX_APARELHOS = 10;

export interface Inscricao {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  criadoEm: number;
  geracao: number;
  vapid: string;
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

export function configurarVapid(): boolean {
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!publica || !privada || !subject) return false;
  webpush.setVapidDetails(subject, publica, privada);
  return true;
}

export type ResultadoCadastro =
  | { ok: true; aparelho: string }
  | { ok: false; erro: string; status: 400 | 409 };

/**
 * Cadastra o aparelho pro usuário autenticado. Um aparelho tem UM dono:
 * se o mesmo navegador estava ligado a outra conta (logout offline, conta
 * trocada), o vínculo antigo é removido — a conta anterior para de mandar
 * aviso pra este aparelho (auditoria N01).
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

  const indice = await obterDocumento<{ uid: string }>(`pushAparelhos/${aparelho}`);
  if (indice && indice.uid !== uid) {
    await deletarDocumento(`usuarios/${indice.uid}/pushInscricoes/${aparelho}`);
  }

  const atuais = await listarDocumentos(`usuarios/${uid}/pushInscricoes`);
  if (!atuais.some((a) => a.id === aparelho) && atuais.length >= MAX_APARELHOS) {
    return { ok: false, erro: `Limite de ${MAX_APARELHOS} aparelhos. Desative um antes.`, status: 409 };
  }

  await atualizarCampos(`usuarios/${uid}/pushInscricoes/${aparelho}`, {
    endpoint,
    keys,
    criadoEm: Date.now(),
    geracao: Date.now(),
    vapid: assinaturaVapid(),
  });
  await atualizarCampos(`pushAparelhos/${aparelho}`, { uid, em: Date.now() });
  return { ok: true, aparelho };
}

/**
 * Remove o vínculo do aparelho. Aceita pelo dono (uid) OU por quem tem o
 * endpoint na mão (o próprio navegador provando posse) — é o que permite
 * limpar o vínculo de uma conta anterior depois de um logout offline.
 */
export async function revogarAparelho(aparelho: string, uidDono?: string): Promise<boolean> {
  const indice = await obterDocumento<{ uid: string }>(`pushAparelhos/${aparelho}`);
  const dono = indice?.uid;
  if (uidDono && dono && dono !== uidDono) return false;
  const alvo = dono ?? uidDono;
  if (alvo) await deletarDocumento(`usuarios/${alvo}/pushInscricoes/${aparelho}`);
  await deletarDocumento(`pushAparelhos/${aparelho}`);
  return true;
}

export async function aparelhoVinculado(uid: string, aparelho: string): Promise<boolean> {
  const doc = await obterDocumento(`usuarios/${uid}/pushInscricoes/${aparelho}`);
  return doc !== null;
}

export interface Contadores {
  eventos: number;
  notificacoesCriadas: number;
  entregasCriadas: number;
  tentativas: number;
  aceitas: number;
  reagendadas: number;
  falhas: number;
  expiradas: number;
  inscricoesEncerradas: number;
  incidentesConfig: number;
}

export function contadoresZerados(): Contadores {
  return {
    eventos: 0,
    notificacoesCriadas: 0,
    entregasCriadas: 0,
    tentativas: 0,
    aceitas: 0,
    reagendadas: 0,
    falhas: 0,
    expiradas: 0,
    inscricoesEncerradas: 0,
    incidentesConfig: 0,
  };
}

/**
 * Grava os eventos na central do usuário. Id determinístico + "criar só
 * se não existe": rodar de novo não duplica. Só evento NOVO gera entrega
 * de push — reexecução nunca reenvia (auditoria N03).
 */
export async function materializar(
  uid: string,
  eventos: Evento[],
  aparelhos: string[],
  prefs: PreferenciasNotificacao,
  c: Contadores
): Promise<void> {
  for (const e of eventos) {
    if (!tipoPermitido(e.tipo, prefs)) continue;
    c.eventos++;
    const nova = await criarSeNaoExiste(`usuarios/${uid}/notificacoes/${e.id}`, {
      tipo: e.tipo,
      titulo: e.conteudo.titulo,
      corpo: e.conteudo.corpo,
      url: e.conteudo.url,
      diaLocal: e.diaLocal,
      validoAte: e.validoAte,
      estimado: !!e.estimado,
      criadaEm: Date.now(),
    });
    if (!nova) continue;
    c.notificacoesCriadas++;
    for (const aparelho of aparelhos) {
      const criada = await criarSeNaoExiste(`usuarios/${uid}/entregas/${idEntrega(e.id, aparelho)}`, {
        notificacaoId: e.id,
        aparelho,
        tipo: e.tipo,
        status: "pendente",
        tentativas: 0,
        proximaTentativaEm: 0,
        validoAte: e.validoAte,
        criadaEm: Date.now(),
      });
      if (criada) c.entregasCriadas++;
    }
  }
}

interface EntregaDoc {
  notificacaoId: string;
  aparelho: string;
  tipo: TipoNotificacao;
  status: string;
  tentativas: number;
  proximaTentativaEm: number;
  validoAte: number;
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

/**
 * Processa as entregas pendentes do usuário (novas e retentativas de
 * execuções anteriores). Recheca a preferência e se o aparelho ainda está
 * vinculado imediatamente antes de enviar; entrega vencida é expirada sem
 * envio (aviso de "hoje" não chega amanhã).
 *
 * Honestidade: "aceita" = o provedor de push recebeu. O app não sabe se
 * apareceu na tela — isso não é contado como entregue.
 */
export async function processarEntregas(
  uid: string,
  prefs: PreferenciasNotificacao,
  agora: number,
  c: Contadores
): Promise<{ incidenteConfig: boolean }> {
  const entregas = (await listarDocumentos<EntregaDoc>(`usuarios/${uid}/entregas`)).filter(
    (e) => e.dados.status === "pendente" && (e.dados.proximaTentativaEm ?? 0) <= agora
  );
  if (entregas.length === 0) return { incidenteConfig: false };

  const inscricoes = new Map(
    (await listarDocumentos<Inscricao>(`usuarios/${uid}/pushInscricoes`)).map((i) => [i.id, i.dados])
  );

  for (const { id, dados: e } of entregas) {
    const caminho = `usuarios/${uid}/entregas/${id}`;
    const inscricao = inscricoes.get(e.aparelho);

    if (e.validoAte <= agora) {
      await atualizarCampos(caminho, { status: "expirada", atualizadaEm: agora });
      c.expiradas++;
      continue;
    }
    if (!inscricao || !tipoPermitido(e.tipo, prefs)) {
      await atualizarCampos(caminho, { status: "descartada", atualizadaEm: agora });
      continue;
    }

    const notif = await obterDocumento<NotificacaoDoc>(`usuarios/${uid}/notificacoes/${e.notificacaoId}`);
    if (!notif) {
      await atualizarCampos(caminho, { status: "descartada", atualizadaEm: agora });
      continue;
    }

    const tentativas = (e.tentativas ?? 0) + 1;
    c.tentativas++;
    const { status, retryAfter } = await enviarUmPush(
      inscricao,
      payloadPush(e.notificacaoId, e.tipo, notif, prefs.detalhesNoPush),
      Math.floor((e.validoAte - agora) / 1000)
    );
    const decisao = decidirAposEnvio(status, tentativas, agora, retryAfter);

    // erro normalizado: só o código, nunca endpoint ou chave
    const base = { tentativas, ultimoStatus: status, atualizadaEm: agora };
    switch (decisao.acao) {
      case "aceita":
        await atualizarCampos(caminho, { ...base, status: "aceita" });
        c.aceitas++;
        break;
      case "encerrar_inscricao":
        await atualizarCampos(caminho, { ...base, status: "falhou" });
        await revogarAparelho(e.aparelho, uid);
        inscricoes.delete(e.aparelho);
        c.inscricoesEncerradas++;
        c.falhas++;
        break;
      case "retentar":
        await atualizarCampos(caminho, { ...base, proximaTentativaEm: decisao.proximaTentativaEm });
        c.reagendadas++;
        break;
      case "incidente_config":
        // chave VAPID errada: para o lote do usuário sem apagar inscrição
        await atualizarCampos(caminho, { ...base, proximaTentativaEm: agora + 3_600_000 });
        c.incidentesConfig++;
        return { incidenteConfig: true };
      case "desistir":
        await atualizarCampos(caminho, { ...base, status: "falhou" });
        c.falhas++;
        break;
    }
  }
  return { incidenteConfig: false };
}
