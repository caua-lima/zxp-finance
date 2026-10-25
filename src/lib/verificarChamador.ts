import { NextRequest, NextResponse } from "next/server";
import { verificarIdToken, TokenVerificado } from "./googleAuth";
import { consultarConta } from "./usuariosFirebase";
import { ehAdminGlobal, sessaoRevogada } from "./autorizacao";
import { decisaoDeAcesso } from "./acesso/servidor";
import { MENSAGEM_BLOQUEIO } from "./acesso/concessao";
import { adicionarDocumento } from "./firestoreRest";

/** Só autentica: assinatura, emissor, audience e prazos do token. */
export async function verificarChamador(req: NextRequest): Promise<TokenVerificado | null> {
  const cabecalho = req.headers.get("authorization") ?? "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7) : null;
  if (!token) return null;
  try {
    return await verificarIdToken(token);
  } catch {
    return null;
  }
}

type Resultado =
  | { ok: true; identidade: TokenVerificado }
  | { ok: false; resposta: NextResponse };

function negar(status: 401 | 403, erro: string): Resultado {
  return { ok: false, resposta: NextResponse.json({ erro }, { status }) };
}

/**
 * Autentica E confere o estado atual da conta no Auth: suspensa ou com
 * sessão revogada não passa, mesmo com token ainda dentro do prazo. Pra
 * rotas sensíveis (administração, exportar, excluir, notificações).
 */
export async function verificarChamadorAtivo(
  req: NextRequest,
  /** false só pra quem ainda vai GANHAR a concessão (aceitar convite). */
  opcoes: { exigirConcessao?: boolean } = {}
): Promise<Resultado> {
  const identidade = await verificarChamador(req);
  if (!identidade) return negar(401, "Não autenticado.");
  try {
    const conta = await consultarConta(identidade.uid);
    if (!conta.existe || conta.disabled) return negar(403, "Conta suspensa.");
    if (sessaoRevogada(identidade.authTime, conta.validSince)) {
      return negar(401, "Sessão expirada. Entre de novo.");
    }
    // concessão da mentoria: a mesma decisão das regras do Firestore
    const acesso =
      opcoes.exigirConcessao === false ? { liberado: true, motivo: null } : await decisaoDeAcesso(identidade.uid);
    if (!acesso.liberado && !ehAdminGlobal(identidade.uid, identidade.claims, process.env.ADMIN_UIDS)) {
      return negar(403, MENSAGEM_BLOQUEIO[acesso.motivo ?? "sem_concessao"]);
    }
  } catch {
    // sem conseguir confirmar o estado, nega — deny-by-default
    return negar(403, "Não foi possível confirmar sua conta agora.");
  }
  return { ok: true, identidade };
}

/**
 * Administração da plataforma (logins de outros clientes). Autenticado,
 * conta ativa E admin global — ver autorizacao.ts pra de onde vem o papel.
 * Sem ADMIN_UIDS nem claim configurados, ninguém é admin (deny-by-default).
 */
export async function verificarAdmin(req: NextRequest): Promise<Resultado> {
  const ativo = await verificarChamadorAtivo(req);
  if (!ativo.ok) return ativo;
  if (!ehAdminGlobal(ativo.identidade.uid, ativo.identidade.claims, process.env.ADMIN_UIDS)) {
    return negar(403, "Acesso restrito à administração.");
  }
  return ativo;
}

/**
 * Trilha de auditoria de operação privilegiada, gravada pelo SERVIDOR numa
 * coleção que nenhum cliente consegue escrever nem apagar (ver
 * firestore.rules). Nunca registra senha nem token.
 */
export async function auditarOperacaoAdmin(
  req: NextRequest,
  ator: TokenVerificado,
  operacao: string,
  alvoUid: string | null,
  detalhes: Record<string, unknown> = {}
): Promise<void> {
  try {
    await adicionarDocumento("auditoriaPlataforma", {
      operacao,
      atorUid: ator.uid,
      atorEmail: ator.email ?? null,
      alvoUid,
      detalhes,
      requisicaoId: req.headers.get("x-vercel-id") ?? crypto.randomUUID(),
      em: new Date(),
    });
  } catch (e) {
    // auditoria não pode derrubar a operação, mas a falha precisa aparecer
    console.error(JSON.stringify({ evento: "auditoria_falhou", operacao, erro: String(e) }));
  }
}
