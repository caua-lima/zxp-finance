/**
 * Migração v2 do modelo financeiro (auditoria O04) — SÓ LEITURA.
 *
 *   node --env-file=.env.local --import tsx scripts/migracao-v2.ts
 *
 * A v2 foi desenhada pra NÃO precisar reescrever dado antigo: o código
 * novo entende o formato velho (gasto sem `data` usa o dia do registro,
 * pagamento sem `afetaSaldo` não mexe no saldo, recorrência sem vigência
 * vale desde o cadastro). Este script é o dry-run obrigatório antes do
 * deploy: mostra, por usuário, o que é legado, o que ficou ambíguo e
 * compara o saldo pela regra antiga e pela nova. Não grava nada.
 *
 * Dado ambíguo é SINALIZADO, nunca adivinhado. Rollback: voltar o deploy
 * pro commit anterior — nenhum documento foi alterado pela migração.
 */
import { listarUsuarios } from "../src/lib/usuariosFirebase";
import { listarDocumentos, obterDocumento } from "../src/lib/firestoreRest";
import { saldoConfirmado, MovimentoPagamento } from "../src/lib/finance/saldo";
import { formatarMoeda } from "../src/lib/types";
import type { Gasto, Ganho, ContaFixa, Assinatura, Parcela, Caixinha } from "../src/lib/types";

async function main() {
  const usuarios = await listarUsuarios();
  console.log(`# Dry-run migração v2 — ${new Date().toISOString()} — ${usuarios.length} usuário(s)\n`);

  for (const u of usuarios) {
    const base = `usuarios/${u.uid}`;
    const ler = async <T,>(c: string) =>
      (await listarDocumentos<T>(`${base}/${c}`)).map((d) => ({ ...d.dados, id: d.id }) as T & { id: string });

    const [saldo, gastos, pagamentos, ganhos, contas, assinaturas, parcelas, caixinhas] = await Promise.all([
      obterDocumento<{ valor: number; atualizadoEm: number; percentualCdi?: number }>(`${base}/saldo/atual`),
      ler<Gasto>("gastos"),
      ler<MovimentoPagamento>("pagamentos"),
      ler<Ganho>("ganhos"),
      ler<ContaFixa>("contasFixas"),
      ler<Assinatura>("assinaturas"),
      ler<Parcela>("parcelas"),
      ler<Caixinha>("caixinhas"),
    ]);

    console.log(`## ${u.email ?? u.uid}${u.disabled ? " (suspenso)" : ""}`);

    // saldo: regra antiga x regra nova
    if (saldo) {
      const antigo =
        saldo.valor -
        gastos.filter((g) => g.criadoEm > saldo.atualizadoEm).reduce((a, g) => a + g.valor, 0);
      const novo = saldoConfirmado(saldo, gastos, pagamentos);
      console.log(
        `- Saldo confirmado: regra antiga ${formatarMoeda(antigo)} → nova ${formatarMoeda(novo ?? 0)}` +
          (Math.abs(antigo - (novo ?? 0)) > 0.005 ? "  ⚠ DIFERENTE — revisar" : "  (igual)")
      );
      if (saldo.percentualCdi === undefined) {
        console.log("- Saldo sem % do CDI: estimativa de rendimento desligada até você configurar.");
      }
    } else {
      console.log("- Sem saldo informado.");
    }

    const semData = gastos.filter((g) => !g.data).length;
    console.log(`- Gastos sem data efetiva (legado, usam o dia do registro): ${semData} de ${gastos.length}`);

    const pagLegados = pagamentos.filter((p) => !p.afetaSaldo && p.origem !== "ganho").length;
    console.log(
      `- Pagamentos antigos sem movimento de caixa (não mexem no saldo): ${pagLegados} de ${pagamentos.length}`
    );

    const semTipo = ganhos.filter((g) => g.tipo !== "recorrente" && g.tipo !== "pontual");
    if (semTipo.length) {
      console.log(`- ⚠ Ganhos sem tipo (ignorados pelo app): ${semTipo.map((g) => `"${g.descricao}" ${formatarMoeda(g.valor)}`).join(", ")}`);
    }

    const comissaoPorTexto = ganhos.filter(
      (g) =>
        g.tipo === "pontual" &&
        !g.origemComissao &&
        (g.categoriaReceita === "Comissão" || /^comiss[aã]o/i.test(g.descricao ?? ""))
    );
    if (comissaoPorTexto.length) {
      console.log(
        `- ⚠ Ganhos que parecem pagamento de comissão, sem vínculo com o mês de origem (não abatem previsão): ${comissaoPorTexto
          .map((g) => `"${g.descricao}" ${g.mes} ${formatarMoeda(g.valor)}`)
          .join(", ")}`
      );
    }

    const arquivadasSemMes = [...contas, ...assinaturas].filter((r) => !r.ativa && !r.desativadaEm);
    if (arquivadasSemMes.length) {
      console.log(
        `- Recorrências arquivadas antes da v2 (sem mês de arquivamento; somem de todos os meses, como antes): ${arquivadasSemMes
          .map((r) => `"${r.nome}"`)
          .join(", ")}`
      );
    }

    const semCartao = parcelas.filter((p) => p.naFatura && !p.cartao);
    if (semCartao.length) {
      console.log(
        `- ⚠ Parcelas "na fatura" sem cartão (ficam como "a confirmar"): ${semCartao.map((p) => `"${p.nome}"`).join(", ")}`
      );
    }

    const caixinhasSemCdi = caixinhas.filter((c) => c.percentualCdi === undefined);
    if (caixinhasSemCdi.length) {
      console.log(
        `- Caixinhas sem % do CDI (sem estimativa de rendimento): ${caixinhasSemCdi.map((c) => `"${c.nome}"`).join(", ")}`
      );
    }
    console.log("");
  }
  console.log("Nada foi gravado. Pra aplicar: fazer o deploy desta versão (o código lê o formato antigo).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
