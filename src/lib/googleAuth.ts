import { createSign, createVerify, createPublicKey } from "crypto";
import { problemaTemporalDoToken } from "./autorizacao";

const ESCOPO_IDENTITY = "https://www.googleapis.com/auth/identitytoolkit";
const ESCOPO_FIRESTORE = "https://www.googleapis.com/auth/datastore";
const URL_TOKEN = "https://oauth2.googleapis.com/token";
const URL_CERTS =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";

function base64url(entrada: Buffer | string): string {
  const buffer = typeof entrada === "string" ? Buffer.from(entrada) : entrada;
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function credenciais() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Credenciais do Firebase Admin ausentes. Confira FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY."
    );
  }
  return { projectId, clientEmail, privateKey };
}

const cacheTokens = new Map<string, { valor: string; expiraEm: number }>();

/**
 * Troca a service account por um access token OAuth2 do Google, escopado
 * pro que for pedido. Cache separado por escopo — o token do
 * identitytoolkit (gerenciar logins) não serve pro datastore (ler/
 * escrever Firestore direto, sem passar pelas regras de segurança).
 */
export async function accessToken(
  escopo: string = ESCOPO_IDENTITY
): Promise<string> {
  const cache = cacheTokens.get(escopo);
  if (cache && Date.now() < cache.expiraEm - 60_000) {
    return cache.valor;
  }

  const { clientEmail, privateKey } = credenciais();
  const agora = Math.floor(Date.now() / 1000);

  const cabecalho = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const corpo = base64url(
    JSON.stringify({
      iss: clientEmail,
      scope: escopo,
      aud: URL_TOKEN,
      iat: agora,
      exp: agora + 3600,
    })
  );

  const assinatura = createSign("RSA-SHA256")
    .update(`${cabecalho}.${corpo}`)
    .sign(privateKey);
  const jwt = `${cabecalho}.${corpo}.${base64url(assinatura)}`;

  const resposta = await fetch(URL_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const dados = await resposta.json();
  if (!resposta.ok || !dados.access_token) {
    throw new Error(
      `Falha ao autenticar com o Google: ${dados.error_description ?? dados.error ?? resposta.status}`
    );
  }

  cacheTokens.set(escopo, {
    valor: dados.access_token,
    expiraEm: Date.now() + dados.expires_in * 1000,
  });
  return dados.access_token;
}

/** Access token escopado pra ler/escrever Firestore direto via REST. */
export async function accessTokenFirestore(): Promise<string> {
  return accessToken(ESCOPO_FIRESTORE);
}

let cacheCerts: { valor: Record<string, string>; expiraEm: number } | null =
  null;

async function certificadosGoogle(): Promise<Record<string, string>> {
  if (cacheCerts && Date.now() < cacheCerts.expiraEm) return cacheCerts.valor;

  const resposta = await fetch(URL_CERTS);
  if (!resposta.ok) {
    throw new Error("Não foi possível buscar as chaves públicas do Google.");
  }
  const valor = await resposta.json();

  const cacheControl = resposta.headers.get("cache-control") ?? "";
  const maxAge = Number(cacheControl.match(/max-age=(\d+)/)?.[1] ?? 3600);
  cacheCerts = { valor, expiraEm: Date.now() + maxAge * 1000 };
  return valor;
}

export interface TokenVerificado {
  uid: string;
  email?: string;
  /** Claims do token, incluindo custom claims (ex: `admin`). */
  claims: Record<string, unknown>;
  /** Quando o token foi emitido (segundos). */
  iat: number;
  /** Quando a pessoa autenticou (segundos) — base da checagem de revogação. */
  authTime: number;
}

/** Valida o ID token que o app do usuário mandou no header Authorization. */
/**
 * Token do EMULADOR de Auth: não tem assinatura (alg "none"). Só é aceito
 * com FIREBASE_AUTH_EMULATOR_HOST definido E fora de produção — as duas
 * condições nunca existem no deploy.
 */
function verificarTokenDoEmulador(idToken: string): TokenVerificado | null {
  if (!process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.NODE_ENV === "production") return null;
  try {
    const corpo = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    const projeto = process.env.GCLOUD_PROJECT ?? "demo-zxp";
    if (corpo.aud !== projeto || !corpo.sub) return null;
    if (problemaTemporalDoToken(corpo, Math.floor(Date.now() / 1000))) return null;
    return { uid: corpo.sub, email: corpo.email, claims: corpo, iat: corpo.iat, authTime: corpo.auth_time };
  } catch {
    return null;
  }
}

export async function verificarIdToken(
  idToken: string
): Promise<TokenVerificado | null> {
  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) return verificarTokenDoEmulador(idToken);
  const partes = idToken.split(".");
  if (partes.length !== 3) return null;

  const [cabecalhoB64, corpoB64, assinaturaB64] = partes;

  let cabecalho: { kid?: string; alg?: string };
  let corpo: {
    sub?: string;
    aud?: string;
    iss?: string;
    exp?: number;
    iat?: number;
    auth_time?: number;
    email?: string;
    [claim: string]: unknown;
  };
  try {
    cabecalho = JSON.parse(Buffer.from(cabecalhoB64, "base64url").toString());
    corpo = JSON.parse(Buffer.from(corpoB64, "base64url").toString());
  } catch {
    return null;
  }

  const { projectId } = credenciais();

  if (cabecalho.alg !== "RS256" || !cabecalho.kid) return null;
  if (corpo.aud !== projectId) return null;
  if (corpo.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!corpo.sub) return null;
  if (problemaTemporalDoToken(corpo, Math.floor(Date.now() / 1000))) return null;

  const certs = await certificadosGoogle();
  const certificado = certs[cabecalho.kid];
  if (!certificado) return null;

  const valido = createVerify("RSA-SHA256")
    .update(`${cabecalhoB64}.${corpoB64}`)
    .verify(
      createPublicKey(certificado),
      Buffer.from(assinaturaB64, "base64url")
    );

  if (!valido) return null;
  // problemaTemporalDoToken já garantiu iat e auth_time presentes e coerentes
  return {
    uid: corpo.sub,
    email: corpo.email,
    claims: corpo,
    iat: corpo.iat as number,
    authTime: corpo.auth_time as number,
  };
}
