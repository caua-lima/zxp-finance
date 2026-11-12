import { NextRequest, NextResponse } from "next/server";
import { donoDoBanco } from "@/lib/pluggy/acesso";
import { darNome } from "@/lib/pluggy/darNome";
import { lerJson, texto } from "@/lib/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** "Dar nome" a um lançamento do banco (ver lib/pluggy/darNome.ts). */
export async function POST(req: NextRequest) {
  const r = await donoDoBanco(req);
  if ("resposta" in r) return r.resposta;

  const corpo = await lerJson(req);
  const id = texto(corpo?.id, 1, 200);
  const descricao = texto(corpo?.descricao, 1, 80);
  if (!id || !descricao || /[/]/.test(id)) {
    return NextResponse.json({ erro: "Dê um nome de até 80 caracteres." }, { status: 400 });
  }
  const resultado = await darNome(r.cfg.uid, {
    colecao: corpo?.tipo === "ganho" ? "ganhos" : "gastos",
    id,
    descricao,
    categoria: texto(corpo?.categoria, 1, 40),
    escopo: corpo?.escopo === "todos" ? "todos" : "este",
  });
  if (!resultado.ok) return NextResponse.json({ erro: resultado.erro }, { status: resultado.status });
  return NextResponse.json(resultado);
}
