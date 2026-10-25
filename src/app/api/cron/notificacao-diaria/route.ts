import { NextRequest, NextResponse } from "next/server";
import { listarUsuarios } from "@/lib/usuariosFirebase";
import { listarDocumentos, obterDocumento, atualizarCampos } from "@/lib/firestoreRest";
import { hojeISO } from "@/lib/finance/calculations";
import { decisaoDeAcesso } from "@/lib/acesso/servidor";
import type {
  Gasto,
  Ganho,
  ContaFixa,
  Assinatura,
  Parcela,
  FaturaCartao,
  Comissao,
} from "@/lib/types";
import type { MovimentoPagamento } from "@/lib/finance/saldo";
import { eventosDoDia, DadosDoUsuario } from "@/lib/notificacoes/eventos";
import { preferenciasPadrao, PreferenciasNotificacao } from "@/lib/notificacoes/regras";
import {
  configurarVapid,
  materializar,
  processarEntregas,
  contadoresZerados,
  Contadores,
} from "@/lib/notificacoes/servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Quantos usuários são processados ao mesmo tempo. */
const CONCORRENCIA = 4;

/**
 * Roda 1x por dia (Vercel Cron, ver vercel.json). Em três passos, por
 * usuário (auditoria N03/N04/N08):
 *
 * 1. GERA os avisos do dia a partir do estado financeiro (eventos.ts) —
 *    com o mesmo contrato de saldo da tela;
 * 2. MATERIALIZA na central do app com id determinístico — cron duplicado
 *    ou reexecutado não duplica nada, e execução perdida é recuperada no
 *    dia seguinte (vencimento usa faixa, não dia exato);
 * 3. ENTREGA por push o que está pendente, com retry/backoff de execuções
 *    anteriores, sem reenviar o que já foi aceito.
 *
 * Usuário suspenso é pulado. Falha num usuário não para os outros. A
 * resposta traz contadores com significado real — "aceita" é o provedor
 * de push ter recebido, não "apareceu na tela".
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }
  const pushConfigurado = configurarVapid();

  const inicio = Date.now();
  const hoje = hojeISO();
  const execucao = `${hoje}__${inicio}`;
  const c: Contadores = contadoresZerados();
  let usuariosProcessados = 0;
  let usuariosComErro = 0;
  let incidenteConfig = false;

  const usuarios = (await listarUsuarios()).filter((u) => !u.disabled);
  await atualizarCampos(`execucoesNotificacao/${execucao}`, {
    dia: hoje,
    inicio,
    status: "rodando",
    usuarios: usuarios.length,
  });

  async function processar(uid: string) {
    // sem acesso liberado (suspenso, encerrado, vencido): nenhum aviso novo
    if (!(await decisaoDeAcesso(uid)).liberado) return;
    const base = `usuarios/${uid}`;
    const ler = async <T,>(col: string) =>
      (await listarDocumentos<T>(`${base}/${col}`)).map((d) => ({ ...d.dados, id: d.id }) as T & { id: string });

    const [saldo, gastos, pagamentos, contas, assinaturas, parcelas, faturas, ganhos, comissoes, cartoes, prefsDoc] =
      await Promise.all([
        obterDocumento<{ valor: number; atualizadoEm: number; reservaMeta?: number }>(`${base}/saldo/atual`),
        ler<Gasto>("gastos"),
        ler<MovimentoPagamento>("pagamentos"),
        ler<ContaFixa>("contasFixas"),
        ler<Assinatura>("assinaturas"),
        ler<Parcela>("parcelas"),
        ler<FaturaCartao>("faturasCartao"),
        ler<Ganho>("ganhos"),
        ler<Comissao>("comissoes"),
        ler<{ nome: string; diaVencimento?: number | null }>("cartoesConfig"),
        obterDocumento<Partial<PreferenciasNotificacao>>(`${base}/preferencias/notificacoes`),
      ]);

    // preferência salva vence o padrão; comissão é opt-in (liga sozinha só
    // pra quem usa o módulo)
    const prefs: PreferenciasNotificacao = {
      ...preferenciasPadrao(comissoes.length > 0),
      ...Object.fromEntries(Object.entries(prefsDoc ?? {}).filter(([, v]) => typeof v === "boolean")),
    };

    const diaVencimentoPorCartao: Record<string, number> = {};
    for (const cfg of cartoes) if (cfg.diaVencimento) diaVencimentoPorCartao[cfg.nome] = cfg.diaVencimento;

    const dados: DadosDoUsuario = {
      saldo,
      gastos,
      pagamentos,
      contas,
      assinaturas,
      parcelas,
      faturas,
      ganhos,
      comissoes,
      diaVencimentoPorCartao,
      diasComComissao: new Set(comissoes.map((x) => x.data)),
    };

    const aparelhos = (await listarDocumentos(`${base}/pushInscricoes`)).map((a) => a.id);
    await materializar(uid, eventosDoDia(dados, hoje), aparelhos, prefs, c);
    if (pushConfigurado && !incidenteConfig) {
      const r = await processarEntregas(uid, prefs, Date.now(), c);
      if (r.incidenteConfig) incidenteConfig = true;
    }
  }

  // pool simples: CONCORRENCIA usuários por vez, cada um isolado
  const fila = [...usuarios];
  await Promise.all(
    Array.from({ length: CONCORRENCIA }, async () => {
      for (let u = fila.shift(); u; u = fila.shift()) {
        try {
          await processar(u.uid);
          usuariosProcessados++;
        } catch (e) {
          usuariosComErro++;
          // log estruturado sem dado sensível: só o uid e o tipo do erro
          console.error(JSON.stringify({ evento: "notificacao_usuario_falhou", execucao, uid: u.uid, erro: String(e).slice(0, 200) }));
        }
      }
    })
  );

  const resultado = {
    ok: usuariosComErro === 0 && !incidenteConfig && pushConfigurado,
    execucao,
    usuarios: usuarios.length,
    usuariosProcessados,
    usuariosComErro,
    pushConfigurado,
    incidenteConfigVapid: incidenteConfig,
    ...c,
    duracaoMs: Date.now() - inicio,
  };
  await atualizarCampos(`execucoesNotificacao/${execucao}`, {
    ...resultado,
    status: resultado.ok ? "ok" : "com_problemas",
    fim: Date.now(),
  });
  console.log(JSON.stringify({ evento: "notificacao_execucao", ...resultado }));

  // falha total não pode parecer sucesso: 500 quando algo deu errado,
  // pro monitor da Vercel acusar
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 500 });
}
