/**
 * Restauração a partir de um backup de scripts/backup.ts.
 *
 *   node --env-file=.env.local --import tsx scripts/restaurar.ts backups/arquivo.json          (dry-run)
 *   node --env-file=.env.local --import tsx scripts/restaurar.ts backups/arquivo.json --aplicar
 *
 * Dry-run (padrão) compara, por usuário e coleção, quantos documentos o
 * backup tem, quantos existem hoje, e quais faltam ou mudaram (campos e
 * tipos, sem depender da ordem). Com --aplicar, cada documento divergente
 * volta INTEIRO ao estado do backup; documento que existe hoje e não está
 * no backup não é apagado. Só aceita backup no formato 2 (com tipos). Rode primeiro contra o emulador:
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 GCLOUD_PROJECT=demo-zxp.
 */
import { readFileSync } from "node:fs";
import {
  listarDocumentosBrutos,
  regravarDocumentoBruto,
  jsonCanonico,
  CamposBrutos,
} from "../src/lib/firestoreRest";

async function main() {
  const arquivo = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  if (!arquivo) throw new Error("Informe o arquivo do backup.");
  const { formato, backup } = JSON.parse(readFileSync(arquivo, "utf8")) as {
    formato?: number;
    backup: Record<string, Record<string, { id: string; campos: CamposBrutos }[]>>;
  };
  // formato antigo guardava valores já convertidos: restaurar trocaria
  // timestamp por texto e double por inteiro
  if (formato !== 2) throw new Error("Backup em formato antigo (sem tipos). Gere outro com scripts/backup.ts.");

  let divergentes = 0;
  for (const [uid, colecoes] of Object.entries(backup)) {
    console.log(`## ${uid}`);
    for (const [colecao, docs] of Object.entries(colecoes)) {
      const atuais = new Map(
        (await listarDocumentosBrutos(`usuarios/${uid}/${colecao}`)).map((d) => [d.id, jsonCanonico(d.campos)])
      );
      const diferentes = docs.filter((d) => atuais.get(d.id) !== jsonCanonico(d.campos));
      divergentes += diferentes.length;
      console.log(
        `- ${colecao}: backup ${docs.length} · hoje ${atuais.size} · a restaurar ${diferentes.length}`
      );
      if (aplicar) {
        for (const d of diferentes) await regravarDocumentoBruto(`usuarios/${uid}/${colecao}/${d.id}`, d.campos);
      }
    }
  }
  console.log(
    aplicar
      ? `Restaurados ${divergentes} documento(s).`
      : `Dry-run: ${divergentes} documento(s) seriam restaurados. Nada foi gravado.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
