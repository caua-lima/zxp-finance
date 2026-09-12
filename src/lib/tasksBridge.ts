/**
 * Ponte com o ZXP Tasks — server-only, nunca importar isto de um
 * Client Component. Os dois apps têm banco e login totalmente separados
 * (Supabase no Tasks, Firestore aqui); a "integração" é só esta chamada de
 * API pontual, autenticada por um segredo compartilhado que existe só nos
 * dois backends, nunca no navegador de ninguém.
 *
 * Decisão de arquitetura já fechada com o usuário: ponte fina, sem
 * repositório novo, sem fundir os dois bancos.
 */

export interface DesejoEmAberto {
  id: string;
  nome: string;
  precoCentavos: number | null;
  projeto: string | null;
}

/**
 * Busca os itens ainda não comprados da lista de desejos do Tasks. Lança
 * erro com mensagem específica quando a ponte não está configurada, pra
 * quem chama poder mostrar isso na tela em vez de um 500 sem explicação.
 */
export async function listarDesejosEmAberto(): Promise<DesejoEmAberto[]> {
  const baseUrl = process.env.TASKS_API_URL;
  const segredo = process.env.TASKS_FINANCE_BRIDGE_SECRET;

  if (!baseUrl || !segredo) {
    throw new Error(
      "Integração com o ZXP Tasks não configurada (TASKS_API_URL / TASKS_FINANCE_BRIDGE_SECRET)."
    );
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${baseUrl.replace(/\/$/, "")}/api/desejos-em-aberto`, {
      headers: { Authorization: `Bearer ${segredo}` },
      // a lista de desejos muda a qualquer momento — nunca serve cache
      cache: "no-store",
    });
  } catch {
    throw new Error("Não consegui falar com o ZXP Tasks agora.");
  }

  if (resposta.status === 401) {
    throw new Error("Segredo da ponte com o Tasks não bateu — confira TASKS_FINANCE_BRIDGE_SECRET nos dois apps.");
  }
  if (!resposta.ok) {
    throw new Error(`ZXP Tasks respondeu ${resposta.status} ao listar desejos.`);
  }

  const dados = await resposta.json();
  return Array.isArray(dados.itens) ? dados.itens : [];
}
