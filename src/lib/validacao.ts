import { NextRequest } from "next/server";

/**
 * Validação de entrada em tempo de execução (auditoria S07). Tipo do
 * TypeScript não existe no JSON que chega da rede — tudo que vem de fora
 * (corpo de requisição, resposta de IA, documento do Firestore) passa por
 * aqui antes de virar regra de negócio.
 */

const LIMITE_CORPO = 16 * 1024; // 16 KB é muito pra qualquer formulário do app

/** Lê o corpo como objeto JSON, com limite de tamanho. null = inválido/grande demais. */
export async function lerJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  const tamanho = Number(req.headers.get("content-length") ?? 0);
  if (tamanho > LIMITE_CORPO) return null;
  try {
    const bruto = await req.text();
    if (bruto.length > LIMITE_CORPO) return null;
    const valor = JSON.parse(bruto);
    return valor && typeof valor === "object" && !Array.isArray(valor)
      ? (valor as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** Texto aparado dentro do tamanho; null se não for string ou estiver fora. */
export function texto(valor: unknown, min: number, max: number): string | null {
  if (typeof valor !== "string") return null;
  const t = valor.trim();
  return t.length >= min && t.length <= max ? t : null;
}

/** Número finito dentro do intervalo; null pra NaN, Infinity, string, etc. */
export function numero(valor: unknown, min: number, max: number): number | null {
  if (typeof valor !== "number" || !Number.isFinite(valor)) return null;
  return valor >= min && valor <= max ? valor : null;
}

/** Inteiro dentro do intervalo. */
export function inteiro(valor: unknown, min: number, max: number): number | null {
  const n = numero(valor, min, max);
  return n !== null && Number.isInteger(n) ? n : null;
}
