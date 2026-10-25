/**
 * Concessão "legado" pra quem já usa o app, e a chave da exigência
 * (auditoria 25/10 B10, migração sem trancar ninguém).
 *
 *   node --env-file=.env.local --import tsx scripts/concessoes-legado.ts             (simulação)
 *   node --env-file=.env.local --import tsx scripts/concessoes-legado.ts --aplicar   (cria as que faltam)
 *   node --env-file=.env.local --import tsx scripts/concessoes-legado.ts --exigir    (liga a exigência)
 *   node --env-file=.env.local --import tsx scripts/concessoes-legado.ts --desligar  (volta pra transição)
 *
 * --exigir recusa ligar se alguém ativo ficaria sem concessão ativa.
 * Idempotente: rodar de novo não cria nada repetido. Não imprime e-mail.
 */
import { listarUsuarios } from "../src/lib/usuariosFirebase";
import { consultar, criarSeNaoExiste, atualizarCampos } from "../src/lib/firestoreRest";
import { Concessao } from "../src/lib/acesso/concessao";
import { planejarConcessoesLegado } from "../src/lib/acesso/legado";

const semIndefinido = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has("--desligar")) {
    await atualizarCampos("plataforma/config", { exigirConcessao: false, alteradoEm: Date.now() });
    console.log("Exigência de concessão DESLIGADA (transição: todo mundo logado passa).");
    return;
  }

  const usuarios = await listarUsuarios();
  const existentes = new Map(
    (await consultar<Concessao>({ colecao: "acessos" })).map((d) => [d.id, d.dados])
  );
  const plano = planejarConcessoesLegado(usuarios, existentes, Date.now());
  console.log(`Logins: ${usuarios.length} · já têm concessão: ${plano.jaTem} · a criar: ${plano.criar.length}`);
  for (const c of plano.criar) console.log(`  + ${c.uid.slice(0, 6)}… ${c.concessao.estado}`);

  if (args.has("--aplicar") || args.has("--exigir")) {
    let criadas = 0;
    for (const c of plano.criar) {
      if (await criarSeNaoExiste(`acessos/${c.uid}`, semIndefinido({ ...c.concessao }))) criadas++;
    }
    console.log(`Criadas agora: ${criadas}.`);
  } else {
    console.log("Simulação: nada foi gravado. Use --aplicar.");
  }

  if (args.has("--exigir")) {
    if (!plano.podeExigir) {
      console.error("Recusado: alguém ativo ficaria sem concessão ativa. Nada foi ligado.");
      process.exit(1);
    }
    await atualizarCampos("plataforma/config", { exigirConcessao: true, alteradoEm: Date.now() });
    console.log("Exigência de concessão LIGADA.");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
