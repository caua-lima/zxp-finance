import { NextRequest, NextResponse } from "next/server";
import { converterSerieBcb, cdiAnual } from "@/lib/finance/rendimento";
import { hojeISO } from "@/lib/finance/calculations";

export const runtime = "nodejs";

/**
 * Taxa diária do CDI, direto do Banco Central (SGS, série 12 — % ao dia,
 * uma por dia útil). É a referência que a conta e os cofrinhos do Mercado
 * Pago usam pra render. Dado público, sem chave nem login.
 *
 * `?desde=AAAA-MM-DD` devolve do dia seguinte a esse até hoje. Passa
 * pelo servidor porque a API do BCB não libera chamada direto do
 * navegador, e o cache de 1h evita bater lá a cada tela aberta.
 */

const SERIE_CDI = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.12/dados";

function paraBcb(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function diasAtras(iso: string, dias: number): string {
  const [ano, mes, dia] = iso.split("-").map(Number);
  const d = new Date(ano, mes - 1, dia - dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const hoje = hojeISO();
  const pedido = req.nextUrl.searchParams.get("desde");
  // no mínimo os últimos 10 dias (pra sempre ter a taxa mais recente) e
  // no máximo 1 ano pra trás (limite do que faz sentido render de uma vez)
  const umAnoAtras = diasAtras(hoje, 366);
  const dezDiasAtras = diasAtras(hoje, 10);
  let desde = /^\d{4}-\d{2}-\d{2}$/.test(pedido ?? "") ? pedido! : dezDiasAtras;
  if (desde > dezDiasAtras) desde = dezDiasAtras;
  if (desde < umAnoAtras) desde = umAnoAtras;

  const url = `${SERIE_CDI}?formato=json&dataInicial=${paraBcb(desde)}&dataFinal=${paraBcb(hoje)}`;

  try {
    // a API do BCB às vezes trava uma requisição e responde a seguinte em
    // menos de 1s — duas tentativas curtas funcionam melhor que uma longa
    let resposta: Response | null = null;
    for (let tentativa = 0; tentativa < 2 && !resposta; tentativa++) {
      try {
        resposta = await fetch(url, {
          next: { revalidate: 3600 },
          signal: AbortSignal.timeout(8000),
        });
      } catch (e) {
        if (tentativa === 1) throw e;
      }
    }
    if (!resposta || !resposta.ok) {
      return NextResponse.json(
        { erro: `Banco Central respondeu ${resposta?.status ?? "sem resposta"}.` },
        { status: 502 }
      );
    }
    const taxas = converterSerieBcb(await resposta.json());
    const ultima = taxas.length > 0 ? taxas[taxas.length - 1] : null;
    return NextResponse.json({
      taxas,
      ultima,
      anual: ultima ? cdiAnual(ultima.taxa) : null,
    });
  } catch {
    return NextResponse.json(
      { erro: "Não consegui buscar o CDI no Banco Central agora." },
      { status: 502 }
    );
  }
}
