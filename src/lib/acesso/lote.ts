/**
 * Convite em lote (auditoria 25/10 B15): cola uma lista de e-mails, vê a
 * prévia linha a linha (válido, repetido, já tem acesso), e só então gera
 * os links. Nenhuma mensagem é enviada a ninguém: os links voltam pra quem
 * administra mandar como quiser.
 */
export type SituacaoLinha = "novo" | "invalido" | "repetido" | "ja_tem_acesso";

export interface LinhaLote {
  email: string;
  situacao: SituacaoLinha;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAXIMO_LOTE = 200;

export function prepararLote(texto: string, comAcessoNaTurma: Set<string>): LinhaLote[] {
  const vistos = new Set<string>();
  return texto
    .split(/[\n,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, MAXIMO_LOTE)
    .map((email) => {
      let situacao: SituacaoLinha = "novo";
      if (!EMAIL.test(email) || email.length > 254) situacao = "invalido";
      else if (vistos.has(email)) situacao = "repetido";
      else if (comAcessoNaTurma.has(email)) situacao = "ja_tem_acesso";
      vistos.add(email);
      return { email, situacao };
    });
}
