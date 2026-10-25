"use client";

import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { Botao } from "@/components/Botao";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useToast } from "@/components/Toast";
import type { PessoaApi } from "@/components/PainelMentoria";

const DIA = 86_400_000;

type Pedido = { acao: "suspender" | "encerrar" } | null;

/**
 * Suspender, reativar, renovar (+30 dias) e encerrar o acesso de uma
 * pessoa da turma (auditoria 25/10 B14). Suspender e encerrar pedem motivo
 * e cancelam avisos pendentes; nada apaga os dados da pessoa.
 */
export function AcoesConcessao({ pessoa, recarregar }: { pessoa: PessoaApi; recarregar: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const [pedido, setPedido] = useState<Pedido>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(corpo: Record<string, unknown>, sucesso: string): Promise<boolean> {
    setEnviando(true);
    try {
      const r = await fetch(`/api/admin/acessos/${pessoa.uid}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${await user?.getIdToken()}` },
        body: JSON.stringify(corpo),
      });
      const dados = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.erro(dados.erro ?? "Não deu pra mudar o acesso agora.");
        return false;
      }
      toast.sucesso(sucesso);
      recarregar();
      return true;
    } finally {
      setEnviando(false);
    }
  }

  const renovar = () => {
    const base = Math.max(Date.now(), pessoa.fimEm ?? Date.now());
    return enviar({ acao: "renovar", fimEm: base + 30 * DIA }, "Acesso renovado por mais 30 dias.");
  };

  if (pessoa.estado === "encerrado") return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {pessoa.estado === "ativo" && (
        <>
          <Botao tamanho="pequeno" variante="secundario" disabled={enviando} onClick={renovar}>
            +30 dias
          </Botao>
          <Botao tamanho="pequeno" variante="secundario" disabled={enviando} onClick={() => setPedido({ acao: "suspender" })}>
            Suspender
          </Botao>
        </>
      )}
      {pessoa.estado === "suspenso" && (
        <Botao
          tamanho="pequeno"
          variante="secundario"
          disabled={enviando}
          onClick={() => enviar({ acao: "reativar" }, "Acesso reativado.")}
        >
          Reativar
        </Botao>
      )}
      <Botao tamanho="pequeno" variante="fantasma" disabled={enviando} onClick={() => setPedido({ acao: "encerrar" })}>
        Encerrar
      </Botao>

      <ConfirmModal
        aberto={pedido !== null}
        titulo={pedido?.acao === "encerrar" ? "Encerrar acesso" : "Suspender acesso"}
        descricao={
          pedido?.acao === "encerrar"
            ? `${pessoa.email ?? "Essa pessoa"} deixa de entrar no app. Os dados dela continuam guardados e podem ser exportados. Pra voltar, só com convite novo.`
            : `${pessoa.email ?? "Essa pessoa"} deixa de entrar até você reativar. Avisos pendentes são cancelados; nada é apagado.`
        }
        textoConfirmar={pedido?.acao === "encerrar" ? "Encerrar" : "Suspender"}
        perigo={pedido?.acao === "encerrar"}
        pedirMotivo
        onConfirmar={async (motivo) => {
          if (!pedido) return false;
          const ok = await enviar(
            { acao: pedido.acao, motivo },
            pedido.acao === "encerrar" ? "Acesso encerrado." : "Acesso suspenso."
          );
          if (ok) setPedido(null);
          return ok;
        }}
        onCancelar={() => setPedido(null)}
      />
    </div>
  );
}
