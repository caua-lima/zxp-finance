import { execSync } from "node:child_process";

/**
 * Teardown dos testes de navegador: no Windows, encerrar o webServer não
 * derruba os netos (o emulador do Firestore é um java separado), e a
 * próxima execução falha com "porta em uso". Aqui fecha só o que estiver
 * ESCUTANDO nas portas do nosso ambiente de teste (firebase.json e o app).
 */
const PORTAS = [3100, 8089, 9099, 9150, 4400, 4500];

export default async function encerrar() {
  if (process.platform !== "win32" || !process.env.PW_EMULADOR_PROPRIO) return;
  let saida = "";
  try {
    saida = execSync("netstat -ano -p tcp", { encoding: "utf8" });
  } catch {
    return;
  }
  const pids = new Set<string>();
  for (const linha of saida.split(/\r?\n/)) {
    const m = linha.trim().match(/^TCP\s+127\.0\.0\.1:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/);
    if (m && PORTAS.includes(Number(m[1]))) pids.add(m[2]);
  }
  for (const pid of pids) {
    try {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      /* já tinha saído */
    }
  }
}
