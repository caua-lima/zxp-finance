/**
 * Backup completo (só leitura) de todos os usuários pra um arquivo JSON
 * local, com contagem por coleção pra conferir depois.
 *
 *   node --env-file=.env.local --import tsx scripts/backup.ts [pasta]
 *
 * Rode antes de qualquer deploy que mude modelo de dados. Restauração:
 * scripts/restaurar.ts (dry-run por padrão). O arquivo tem dados
 * financeiros reais — fica fora do git (.gitignore: backups/).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listarUsuarios } from "../src/lib/usuariosFirebase";
import { listarDocumentos, listarSubcolecoes } from "../src/lib/firestoreRest";

async function main() {
  const pasta = process.argv[2] ?? "backups";
  mkdirSync(pasta, { recursive: true });
  const usuarios = await listarUsuarios();
  const backup: Record<string, Record<string, unknown[]>> = {};
  const contagem: Record<string, Record<string, number>> = {};

  for (const u of usuarios) {
    backup[u.uid] = {};
    contagem[u.email ?? u.uid] = {};
    for (const colecao of await listarSubcolecoes(`usuarios/${u.uid}`)) {
      const docs = await listarDocumentos(`usuarios/${u.uid}/${colecao}`);
      backup[u.uid][colecao] = docs;
      contagem[u.email ?? u.uid][colecao] = docs.length;
    }
  }

  const arquivo = join(pasta, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(arquivo, JSON.stringify({ geradoEm: new Date().toISOString(), backup }, null, 2));
  console.log(`Backup salvo em ${arquivo}`);
  console.table(contagem);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
