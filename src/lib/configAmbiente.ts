/**
 * Contrato das variáveis de ambiente (auditoria 25/10 A07).
 *
 * Valida PRESENÇA e FORMATO, nunca devolve valor: o diagnóstico vai pra
 * tela de saúde, pro preflight e pros logs. Variável inválida vira um
 * problema com nome e o que fazer — e não um 500 genérico lá na frente.
 */

export type Escopo = "publica" | "servidor";
export type Necessidade = "obrigatoria" | "recurso" | "opcional";

export interface RegraVariavel {
  nome: string;
  escopo: Escopo;
  /** obrigatoria: o app não funciona sem; recurso: liga um recurso (push, Consultor...). */
  necessidade: Necessidade;
  recurso?: string;
  /** Formato esperado, em linguagem de gente (vai no diagnóstico). */
  formato: string;
  valida: (valor: string) => boolean;
}

const naoVazio = (v: string) => v.trim().length > 0;
const base64url = (v: string, tamanho: number) => new RegExp(`^[A-Za-z0-9_-]{${tamanho}}$`).test(v.trim());
const listaDeUids = (v: string) =>
  v.split(",").map((s) => s.trim()).filter(Boolean).every((u) => /^[A-Za-z0-9]{10,128}$/.test(u));

export const REGRAS: RegraVariavel[] = [
  { nome: "NEXT_PUBLIC_FIREBASE_API_KEY", escopo: "publica", necessidade: "obrigatoria", formato: "chave web do Firebase (AIza...)", valida: (v) => /^AIza[0-9A-Za-z_-]{35}$/.test(v.trim()) },
  { nome: "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", escopo: "publica", necessidade: "obrigatoria", formato: "<projeto>.firebaseapp.com", valida: (v) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(v.trim()) },
  { nome: "NEXT_PUBLIC_FIREBASE_PROJECT_ID", escopo: "publica", necessidade: "obrigatoria", formato: "id do projeto (minúsculas, números e hífen)", valida: (v) => /^[a-z0-9-]{4,40}$/.test(v.trim()) },
  { nome: "NEXT_PUBLIC_FIREBASE_APP_ID", escopo: "publica", necessidade: "obrigatoria", formato: "1:<número>:web:<hash>", valida: (v) => /^1:\d+:web:[0-9a-f]+$/.test(v.trim()) },
  { nome: "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", escopo: "publica", necessidade: "opcional", formato: "bucket do projeto", valida: naoVazio },
  { nome: "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", escopo: "publica", necessidade: "opcional", formato: "número", valida: (v) => /^\d+$/.test(v.trim()) },
  { nome: "FIREBASE_PROJECT_ID", escopo: "servidor", necessidade: "obrigatoria", formato: "mesmo id do NEXT_PUBLIC_FIREBASE_PROJECT_ID", valida: (v) => /^[a-z0-9-]{4,40}$/.test(v.trim()) },
  { nome: "FIREBASE_CLIENT_EMAIL", escopo: "servidor", necessidade: "obrigatoria", formato: "e-mail da service account (...iam.gserviceaccount.com)", valida: (v) => /@.+\.iam\.gserviceaccount\.com$/.test(v.trim()) },
  { nome: "FIREBASE_PRIVATE_KEY", escopo: "servidor", necessidade: "obrigatoria", formato: "chave PEM (-----BEGIN PRIVATE KEY-----, com \\n)", valida: (v) => v.includes("BEGIN PRIVATE KEY") && v.includes("END PRIVATE KEY") },
  { nome: "ADMIN_UIDS", escopo: "servidor", necessidade: "recurso", recurso: "administração", formato: "UIDs separados por vírgula", valida: listaDeUids },
  { nome: "CRON_SECRET", escopo: "servidor", necessidade: "recurso", recurso: "notificações agendadas", formato: "texto aleatório com 16+ caracteres", valida: (v) => v.trim().length >= 16 },
  { nome: "NEXT_PUBLIC_VAPID_PUBLIC_KEY", escopo: "publica", necessidade: "recurso", recurso: "push", formato: "chave pública VAPID (87 caracteres base64url)", valida: (v) => base64url(v, 87) },
  { nome: "VAPID_PRIVATE_KEY", escopo: "servidor", necessidade: "recurso", recurso: "push", formato: "chave privada VAPID (43 caracteres base64url)", valida: (v) => base64url(v, 43) },
  { nome: "VAPID_SUBJECT", escopo: "servidor", necessidade: "recurso", recurso: "push", formato: "mailto:... ou https://...", valida: (v) => /^(mailto:\S+@\S+|https:\/\/\S+)$/.test(v.trim()) },
  { nome: "ANTHROPIC_API_KEY", escopo: "servidor", necessidade: "recurso", recurso: "Consultor", formato: "chave sk-ant-...", valida: (v) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v.trim()) },
  { nome: "TASKS_API_URL", escopo: "servidor", necessidade: "recurso", recurso: "ponte ZXP Tasks", formato: "URL https", valida: (v) => /^https:\/\/\S+$/.test(v.trim()) },
  { nome: "TASKS_FINANCE_BRIDGE_SECRET", escopo: "servidor", necessidade: "recurso", recurso: "ponte ZXP Tasks", formato: "segredo com 16+ caracteres", valida: (v) => v.trim().length >= 16 },
  { nome: "TASKS_BRIDGE_UIDS", escopo: "servidor", necessidade: "recurso", recurso: "ponte ZXP Tasks", formato: "UIDs separados por vírgula", valida: listaDeUids },
];

export type EstadoVariavel = "ok" | "ausente" | "invalida";

export interface DiagnosticoVariavel {
  nome: string;
  escopo: Escopo;
  necessidade: Necessidade;
  recurso?: string;
  estado: EstadoVariavel;
  /** Só quando há problema: o formato esperado. Nunca o valor. */
  esperado?: string;
}

export interface DiagnosticoAmbiente {
  variaveis: DiagnosticoVariavel[];
  /** Impede o app de funcionar. */
  bloqueios: string[];
  /** Desliga um recurso (push, Consultor...), o resto funciona. */
  avisos: string[];
  /** Recursos com tudo que precisam. */
  recursosAtivos: string[];
}

export function diagnosticarAmbiente(env: Record<string, string | undefined>): DiagnosticoAmbiente {
  const variaveis: DiagnosticoVariavel[] = REGRAS.map((r) => {
    const valor = env[r.nome];
    const estado: EstadoVariavel = !valor || !valor.trim() ? "ausente" : r.valida(valor) ? "ok" : "invalida";
    return {
      nome: r.nome,
      escopo: r.escopo,
      necessidade: r.necessidade,
      ...(r.recurso ? { recurso: r.recurso } : {}),
      estado,
      ...(estado !== "ok" ? { esperado: r.formato } : {}),
    };
  });

  const bloqueios: string[] = [];
  const avisos: string[] = [];
  for (const v of variaveis) {
    if (v.estado === "ok") continue;
    const msg = `${v.nome} ${v.estado === "ausente" ? "ausente" : "em formato inválido"} — esperado: ${v.esperado}`;
    if (v.necessidade === "obrigatoria") bloqueios.push(msg);
    else if (v.necessidade === "recurso") avisos.push(`${msg} (desliga: ${v.recurso})`);
  }

  // incoerências entre variáveis
  const idPublico = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
  const idServidor = env.FIREBASE_PROJECT_ID?.trim();
  if (idPublico && idServidor && idPublico !== idServidor) {
    bloqueios.push("NEXT_PUBLIC_FIREBASE_PROJECT_ID e FIREBASE_PROJECT_ID apontam pra projetos diferentes");
  }
  for (const nome of Object.keys(env)) {
    if (/^NEXT_PUBLIC_.*(SECRET|PRIVATE|TOKEN|PASSWORD|SENHA)/i.test(nome)) {
      bloqueios.push(`${nome}: segredo em variável NEXT_PUBLIC (vai pro navegador de todo mundo)`);
    }
  }

  const porRecurso = new Map<string, boolean>();
  for (const v of variaveis) {
    if (!v.recurso) continue;
    porRecurso.set(v.recurso, (porRecurso.get(v.recurso) ?? true) && v.estado === "ok");
  }
  const recursosAtivos = [...porRecurso.entries()].filter(([, ok]) => ok).map(([r]) => r);

  return { variaveis, bloqueios, avisos, recursosAtivos };
}
