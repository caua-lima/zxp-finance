import { NextRequest, NextResponse } from "next/server";
import { verificarChamadorAtivo } from "@/lib/verificarChamador";
import { exportarCliente } from "@/lib/contaCliente";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Baixa todos os dados do PRÓPRIO usuário (o uid vem do token, nunca da URL). */
export async function GET(req: NextRequest) {
  // exportar os próprios dados vale mesmo com acesso suspenso/encerrado:
  // a pessoa nunca fica sem os dados dela (auditoria 25/10 S03)
  const acesso = await verificarChamadorAtivo(req, { exigirConcessao: false });
  if (!acesso.ok) return acesso.resposta;
  try {
    const dados = await exportarCliente(acesso.identidade.uid);
    return new NextResponse(
      JSON.stringify({ exportadoEm: new Date().toISOString(), dados }, null, 2),
      {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": `attachment; filename="zxp-finance-${new Date().toISOString().slice(0, 10)}.json"`,
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json({ erro: "Não consegui gerar a exportação agora." }, { status: 500 });
  }
}
