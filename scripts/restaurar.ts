/**
 * Restauração a partir de um backup de scripts/backup.ts.
 *
 *   node --env-file=.env.local --import tsx scripts/restaurar.ts backups/arquivo.json          (dry-run)
 *   node --env-file=.env.local --import tsx scripts/restaurar.ts backups/arquivo.json --aplicar
 *
 * Dry-run (padrão) compara, por usuário e coleção, quantos documentos o
 * backup tem, quantos existem hoje, e quais faltam ou mudaram. Com
 * --aplicar, regrava SÓ os documentos do backup (não apaga nada que exista
 * hoje e não está no backup). Rode primeiro contra o emulador:
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8089 GCLOUD_PROJECT=demo-zxp.
 */
import { readFileSync } from "node:fs";
import { listarDocumentos, atualizarCampos, DocumentoFirestore } from "../src/lib/firestoreRest";

async function main() {
  const arquivo = process.argv[2];
  const aplicar = process.argv.includes("--aplicar");
  if (!arquivo) throw new Error("Informe o arquivo do backup.");
  const { backup } = JSON.parse(readFileSync(arquivo, "utf8")) as {
    backup: Record<string, Record<string, DocumentoFirestore[]>>;
  };

  let divergentes = 0;
  for (const [uid, colecoes] of Object.entries(backup)) {
    console.log(`## ${uid}`);
    for (const [colecao, docs] of Object.entries(colecoes)) {
      const atuais = new Map(
        (await listarDocumentos(`usuarios/${uid}/${colecao}`)).map((d) => [d.id, JSON.stringify(d.dados)])
      );
      const diferentes = docs.filter((d) => atuais.get(d.id) !== JSON.stringify(d.dados));
      divergentes += diferentes.length;
      console.log(
        `- ${colecao}: backup ${docs.length} · hoje ${atuais.size} · a restaurar ${diferentes.length}`
      );
      if (aplicar) {
        for (const d of diferentes) await atualizarCampos(`usuarios/${uid}/${colecao}/${d.id}`, d.dados);
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
