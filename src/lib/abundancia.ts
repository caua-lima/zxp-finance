/**
 * Linguagem de abundância do app.
 *
 * O dono pediu pra trocar o enquadramento de escassez ("quanto posso
 * gastar", "passou do limite") por um de prosperidade: dinheiro que sai
 * vira investimento em qualidade de vida, e o app dá pequenos sinais
 * positivos ao longo do dia.
 *
 * O que muda é só a LINGUAGEM. Os números continuam os reais (saldo,
 * contas, faturas) — esconder número não cria dinheiro, e o que de fato
 * ajuda (atenção ao que importa, identidade, gratidão, registrar sempre)
 * depende de olhar pra eles com tranquilidade.
 */

export interface AreaDaVida {
  nome: string;
  icone: string;
}

/** Categoria do gasto → área da vida em que o dinheiro foi investido. */
const AREAS: Record<string, AreaDaVida> = {
  Alimentação: { nome: "Nutrição e prazer", icone: "🍽️" },
  Transporte: { nome: "Mobilidade e liberdade", icone: "🚗" },
  Casa: { nome: "Lar e conforto", icone: "🏠" },
  Saúde: { nome: "Saúde e energia", icone: "🌿" },
  Lazer: { nome: "Experiências e alegria", icone: "✨" },
  Compras: { nome: "Estilo e autoestima", icone: "👕" },
  Outros: { nome: "Vida", icone: "🌱" },
  "Não lançado": { nome: "Vida vivida", icone: "🌱" },
};

export function areaDaVida(categoria: string): AreaDaVida {
  return AREAS[categoria] ?? { nome: categoria, icone: "🌱" };
}

/** Complemento de "investido em …": "estilo e autoestima", ou "você" quando é genérico. */
export function investidoEm(categoria: string): string {
  if (!(categoria in AREAS) || categoria === "Outros" || categoria === "Não lançado") return "você";
  return AREAS[categoria].nome.toLowerCase();
}

/**
 * Frases curtas, uma por dia, sempre a mesma no mesmo dia. Afirmações no
 * presente, sobre merecimento, gratidão, movimento e construção — nada de
 * promessa de resultado.
 */
export const FRASES = [
  "O dinheiro flui pra mim com facilidade.",
  "Sou grato por tudo que já tenho.",
  "Cada escolha minha é um investimento em quem eu quero ser.",
  "Eu mereço viver bem.",
  "Minha renda cresce junto com o valor que eu entrego.",
  "Tenho clareza sobre o meu dinheiro, e clareza é poder.",
  "Há abundância de oportunidades ao meu redor.",
  "Eu cuido do meu dinheiro, e ele cuida de mim.",
  "Hoje eu escolho prosperar.",
  "Cada reunião é uma semente de prosperidade.",
  "Sou capaz de criar a vida que eu quero.",
  "Agradeço pelo dinheiro que entra e pelo que ele me permite viver.",
  "Meu trabalho tem valor, e o mundo reconhece isso.",
  "Construo riqueza um dia de cada vez.",
  "Estou em paz com o dinheiro.",
  "Invisto em mim porque eu valho a pena.",
  "Minhas metas estão cada vez mais perto.",
  "O que eu planto hoje eu colho com alegria.",
  "Eu atraio pessoas e oportunidades que me fazem crescer.",
  "Tenho o suficiente, e sempre chega mais.",
  "A prosperidade é o meu estado natural.",
  "Sou dono das minhas escolhas financeiras.",
  "Cada venda confirma o quanto eu sou bom no que faço.",
  "Celebro cada conquista, por menor que seja.",
  "Minha vida financeira melhora a cada mês.",
  "Eu decido com calma e confiança.",
  "Gratidão multiplica o que eu tenho.",
  "Eu sou alguém que sabe para onde o dinheiro vai.",
  "O futuro que estou construindo me inspira.",
  "Hoje é um ótimo dia pra crescer.",
] as const;

function numeroDoDia(hojeISO: string): number {
  const [ano, mes, dia] = hojeISO.split("-").map(Number);
  return Math.floor(Date.UTC(ano, mes - 1, dia) / 86_400_000);
}

export function fraseDoDia(hojeISO: string): string {
  return FRASES[numeroDoDia(hojeISO) % FRASES.length];
}

const CELEBRACOES = [
  "Você merece.",
  "Investir em você é sempre um bom negócio.",
  "Aproveite, isso é qualidade de vida.",
  "Dinheiro bem vivido.",
  "Que isso te faça bem.",
  "Escolha consciente, vida mais leve.",
] as const;

/** Mensagem curta ao registrar um investimento em qualidade de vida. */
export function celebracao(semente: number): string {
  return CELEBRACOES[Math.abs(Math.trunc(semente)) % CELEBRACOES.length];
}

/**
 * O aviso diário (push e central). Antes: "Hoje você pode gastar R$ X".
 * Agora: a frase do dia, o dinheiro disponível e o quanto você já
 * investiu em você no mês — sem limite, sem "passou do previsto".
 */
export function notificacaoDoDia(estado: {
  hojeISO: string;
  saldoAtual: number;
  investidoNoMes: number;
}): { title: string; body: string; url: string } {
  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const investido =
    estado.investidoNoMes > 0
      ? ` Neste mês você já investiu ${brl(estado.investidoNoMes)} em qualidade de vida.`
      : "";
  return {
    title: fraseDoDia(estado.hojeISO),
    body: `Disponível na conta: ${brl(estado.saldoAtual)}.${investido}`,
    url: "/saldo",
  };
}
