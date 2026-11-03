"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useCaixinhas } from "@/lib/useCaixinhas";
import { recomecarDoZero } from "@/lib/recomecar";
import { anexarAuditLog } from "@/lib/auditoria";
import { hojeISO } from "@/lib/finance/calculations";
import { formatarMoeda } from "@/lib/types";
import { mensagemErro } from "@/lib/erroFirebase";
import { MoneyInput } from "@/components/MoneyInput";
import { Dialogo } from "@/components/Dialogo";
import { Botao } from "@/components/Botao";
import { useToast } from "@/components/Toast";

const formatarDia = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Botão de recomeço: a pessoa diz quanto tem na conta agora e a contagem
 * começa hoje. Nada é apagado — o histórico continua lá.
 */
export function RecomecarDoZero() {
  const { user } = useAuth();
  const { caixinhas } = useCaixinhas();
  const toast = useToast();
  const [aberto, setAberto] = useState(false);
  const [saldo, setSaldo] = useState(0);
  const [zerarCaixinhas, setZerarCaixinhas] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const hoje = hojeISO();
  const comDinheiro = caixinhas.filter((c) => Math.round(c.saldo * 100) !== 0);
  const totalCaixinhas = comDinheiro.reduce((a, c) => a + c.saldo, 0);

  async function confirmar() {
    if (!user) return;
    setEnviando(true);
    setErro(null);
    try {
      await recomecarDoZero(
        db,
        user.uid,
        { saldo, hoje, zerarCaixinhas: zerarCaixinhas ? comDinheiro.map((c) => c.id) : [] },
        (batch) =>
          anexarAuditLog(batch, user.uid, user.email, {
            action: "reconciled",
            entityType: "saldo",
            entityId: "atual",
            summary: `Recomeço a partir de ${formatarDia(hoje)} com ${formatarMoeda(saldo)} na conta${
              zerarCaixinhas && comDinheiro.length ? `; caixinhas zeradas (${formatarMoeda(totalCaixinhas)})` : ""
            }`,
            after: { valor: saldo, inicioUso: hoje },
          })
      );
      setAberto(false);
      toast.sucesso(`Pronto: tudo começa de novo hoje, com ${formatarMoeda(saldo)} na conta.`);
    } catch (e) {
      setErro(mensagemErro(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 p-3">
      <p className="text-sm font-medium">Recomeçar do zero a partir de hoje</p>
      <p className="mt-0.5 text-xs text-text-muted">
        O saldo vira o que está na sua conta agora, e o relatório e o investido do mês passam a contar
        só de hoje em diante. Nada é apagado.
      </p>
      <Botao tamanho="pequeno" className="mt-2" onClick={() => setAberto(true)}>
        Recomeçar do zero
      </Botao>

      <Dialogo
        aberto={aberto}
        titulo="Recomeçar do zero"
        descricao={`A contagem começa hoje, ${formatarDia(hoje)}.`}
        onFechar={() => setAberto(false)}
        bloqueado={enviando}
      >
        <label htmlFor="recomeco-saldo" className="rotulo">
          Quanto tem na sua conta agora?
        </label>
        <MoneyInput id="recomeco-saldo" value={saldo} onChange={setSaldo} className="campo" />
        <p className="mt-1 text-xs text-text-muted">Olhe o app do banco e digite o valor exato (pode ser zero).</p>

        {comDinheiro.length > 0 && (
          <label className="mt-3 flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={zerarCaixinhas}
              onChange={(e) => setZerarCaixinhas(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-brand"
            />
            <span>
              Zerar as caixinhas também
              <span className="block text-xs text-text-muted">
                Hoje elas somam {formatarMoeda(totalCaixinhas)}. Deixe marcado se esse dinheiro não está
                separado de verdade no banco.
              </span>
            </span>
          </label>
        )}

        <ul className="mt-3 space-y-1 text-xs text-text-muted">
          <li>• Gastos e ganhos continuam salvos; os de antes de hoje só saem dos totais.</li>
          <li>• Contas, parcelas, assinaturas e salário seguem normais.</li>
          <li>• Para desfazer a contagem, apague a data em &quot;Começar a contar em&quot;.</li>
        </ul>

        {erro && <p className="mt-2 text-xs text-negative">{erro}</p>}

        <div className="mt-4 flex gap-2">
          <Botao variante="secundario" larguraTotal onClick={() => setAberto(false)} disabled={enviando}>
            Cancelar
          </Botao>
          <Botao larguraTotal onClick={confirmar} disabled={enviando}>
            {enviando ? "Salvando..." : "Recomeçar hoje"}
          </Botao>
        </div>
      </Dialogo>
    </div>
  );
}
