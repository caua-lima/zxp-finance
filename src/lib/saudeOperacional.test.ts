import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { avaliarSaude, EntradaSaude } from "./saudeOperacional";

const H = 3_600_000;
const agora = 1_800_000_000_000;
const base: EntradaSaude = {
  agora,
  ultimaExecucao: { inicio: agora - 2 * H, fim: agora - 2 * H + 5000, status: "ok", usuarios: 3, aceitas: 4 },
  pendentes: 0,
  pendenteMaisAntigaEm: null,
  recursosAtivos: ["push", "notificações agendadas"],
  bloqueiosDeAmbiente: [],
};

describe("saúde operacional", () => {
  test("tudo em dia", () => {
    const s = avaliarSaude(base);
    assert.equal(s.geral, "ok");
    assert.match(s.agendador.detalhe, /4 entrega\(s\) aceita\(s\) pelo provedor/);
  });

  test("sem execução há mais de um dia é incidente mesmo sem erro registrado", () => {
    const s = avaliarSaude({ ...base, ultimaExecucao: { ...base.ultimaExecucao!, inicio: agora - 30 * H } });
    assert.equal(s.agendador.estado, "incidente");
    assert.equal(s.geral, "incidente");
  });

  test("execução que começou e não terminou é incidente", () => {
    const s = avaliarSaude({ ...base, ultimaExecucao: { inicio: agora - 2 * H, status: "rodando" } });
    assert.equal(s.agendador.estado, "incidente");
  });

  test("rodou sem exceção mas entrega parada é problema separado", () => {
    const s = avaliarSaude({ ...base, pendentes: 12, pendenteMaisAntigaEm: agora - 8 * H });
    assert.equal(s.agendador.estado, "ok");
    assert.equal(s.entregas.estado, "incidente");
  });

  test("push desligado aparece na configuração, sem valor de chave", () => {
    const s = avaliarSaude({ ...base, recursosAtivos: ["notificações agendadas"] });
    assert.equal(s.configuracao.estado, "atencao");
    assert.ok(s.configuracao.detalhe.some((d) => /VAPID/.test(d)));
  });
});
