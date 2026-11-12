import { normalizarTexto } from "@/lib/categoriasGasto";

/**
 * Apelidos: o nome (e a categoria) que você deu a um destinatário de Pix.
 * Ficam em usuarios/{uid}/apelidos/{contraparte}, gravados pelo servidor
 * quando você escolhe "este e os próximos" — nunca adivinhados.
 */
export interface Apelido {
  descricao: string;
  categoria?: string | null;
  categoriaReceita?: string | null;
  /** Nome que o banco manda pra esse destinatário (pra você reconhecer). */
  nomeBanco?: string | null;
  atualizadoEm: number;
}

/**
 * Maquininha / instituição de pagamento: o Pix vai pro CNPJ dela, não da
 * loja (Cardpay, PagSeguro, Stone...). Vários lugares diferentes caem no
 * mesmo CNPJ, então o nome que você der a um não deve valer pros outros
 * sem você pedir.
 */
const INTERMEDIARIO =
  /instituic[aã]o de pagamento|pagamentos? (ltda|s\.?a)|\b(cardpay|pagseguro|pag seguro|stone|cielo|getnet|sumup|infinitepay|cappta|pagueveloz|shpp|zoop|asaas|gerencianet|pagar\.?me|adyen|ebanx|paypal|picpay|safrapay|rede s\.?a)\b/i;

export function ehIntermediario(nome: string | null | undefined): boolean {
  return !!nome && INTERMEDIARIO.test(normalizarTexto(nome));
}
