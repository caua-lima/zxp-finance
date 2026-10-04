/**
 * Backup completo (só leitura) de todos os usuários pra um arquivo JSON
 * local, com contagem por coleção pra conferir depois.
 *
 *   node --env-file=.env.local --import tsx scripts/backup.ts [pasta]
 *
 * Rode antes de qualquer deploy que mude modelo de dados. Restauração:
 * scripts/restaurar.ts (dry-run por padrão). O arquivo tem dados
 * financeiros reais — fica fora do git (.gitignore: backups/).
 *
 * Formato 2: guarda os campos com o tipo do Firestore (timestamp continua
 * timestamp, double continua double), pra restauração não mudar tipo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { listarUsuarios } from "../src/lib/usuariosFirebase";
import { listarDocumentosBrutos, listarSubcolecoes, CamposBrutos } from "../src/lib/firestoreRest";

async function main() {
  const pasta = process.argv[2] ?? "backups";
  mkdirSync(pasta, { recursive: true });
  const usuarios = await listarUsuarios();
  const backup: Record<string, Record<string, { id: string; campos: CamposBrutos }[]>> = {};
  const contagem: Record<string, Record<string, number>> = {};

  for (const u of usuarios) {
    backup[u.uid] = {};
    contagem[u.email ?? u.uid] = {};
    for (const colecao of await listarSubcolecoes(`usuarios/${u.uid}`)) {
      const docs = await listarDocumentosBrutos(`usuarios/${u.uid}/${colecao}`);
      backup[u.uid][colecao] = docs;
      contagem[u.email ?? u.uid][colecao] = docs.length;
    }
  }

  const arquivo = join(pasta, `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
  writeFileSync(arquivo, JSON.stringify({ formato: 2, geradoEm: new Date().toISOString(), backup }, null, 2));
  console.log(`Backup salvo em ${arquivo}`);
  console.table(contagem);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
