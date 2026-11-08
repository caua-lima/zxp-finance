/**
 * Prévia da sincronização com o banco, SEM gravar nada:
 *   node --env-file=.env.local --import tsx scripts/banco-previa.ts
 * Mostra o saldo do banco e como cada transação seria tratada. Não imprime
 * chave nem token.
 */
import { comConexoes, credenciaisPluggy } from "../src/lib/pluggy/cliente";
import { conexoesGravadas, previaDoBanco } from "../src/lib/pluggy/sincronizar";

async function main() {
  const cred = credenciaisPluggy();
  if (!cred) {
    console.error("Faltam PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET ou PLUGGY_UID no .env.local.");
    process.exit(1);
  }
  const cfg = comConexoes(cred, await conexoesGravadas(cred.uid));
  if (cfg.itemIds.length === 0) {
    console.error("Nenhum banco conectado ainda: use o botão \"Conectar banco\" na tela de Saldo.");
    process.exit(1);
  }
  const { status, escritas } = await previaDoBanco(cfg);
  if (status.erro) {
    console.error("Erro:", status.erro);
    process.exit(1);
  }
  console.log("Conexões:", status.itens.map((i) => `${i.conector ?? "?"} (${i.status})`).join(", "));
  console.log("Banco lido em:", status.bancoLidoEm ? new Date(status.bancoLidoEm).toLocaleString("pt-BR") : "?");
  for (const c of status.contas) console.log(`Conta ${c.tipo} "${c.nome}": R$ ${c.saldo.toFixed(2)}`);
  console.log("Resumo:", JSON.stringify(status.resumo));
  console.log("\nComo cada transação seria tratada:");
  for (const e of escritas.filter((x) => x.caminho.startsWith("bancoTransacoes/"))) {
    const d = e.dados as { data: string; descricao: string; valor: number; destino: string; categoriaBanco: string | null };
    console.log(`  ${d.data}  ${d.valor.toFixed(2).padStart(10)}  ${d.destino.padEnd(16)} ${d.descricao}  [${d.categoriaBanco ?? "-"}]`);
  }
  const outras = escritas.filter((x) => !x.caminho.startsWith("bancoTransacoes/"));
  console.log("\nO que seria gravado:");
  for (const e of outras) console.log(`  ${e.caminho}  ${JSON.stringify(e.dados).slice(0, 160)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
