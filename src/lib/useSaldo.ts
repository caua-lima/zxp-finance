"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, setDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { mensagemErro } from "./erroFirebase";
import { anexarAuditLog } from "./auditoria";
import { arredondarCentavos, formatarMoeda } from "./types";
import { hojeISO } from "./finance/calculations";

export interface Saldo {
  valor: number;
  atualizadoEm: number;
  reservaMeta?: number; // quanto você quer que sobre até o fim do mês
  /**
   * Quanto do CDI a conta rende, só pra ESTIMATIVA mostrada na tela.
   * Ausente = não informado = sem estimativa (o app não presume produto).
   */
  percentualCdi?: number;
}

/**
 * Um único "ponto de partida" do saldo (ex: Mercado Pago). Toda vez
 * que você define um novo valor, ele vira a referência — só os gastos
 * lançados depois disso é que descontam dele.
 */
export function useSaldo() {
  const { user } = useAuth();
  const [saldo, setSaldo] = useState<Saldo | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    const unsubscribe = onSnapshot(
      doc(db, "usuarios", user.uid, "saldo", "atual"),
      (snap) => {
        setSaldo(snap.exists() ? (snap.data() as Saldo) : null);
        setLoading(false);
        setErro(null);
      },
      (e) => {
        setErro(mensagemErro(e));
        setLoading(false);
      }
    );
    return unsubscribe;
  }, [user]);

  /**
   * Define o saldo e ponto: o valor digitado vira o saldo, sem criar
   * "ajuste de conciliação" nenhum. Era isso que confundia — zerar o
   * saldo criava um gasto de ajuste, e a tela ficava cheia de números
   * negativos que não eram gasto de verdade. A diferença pro que o app
   * esperava fica só registrada no histórico, pra consulta.
   *
   * `saldoEsperado` é o que o app calculava antes (pra esse registro).
   */
  /**
   * Define o saldo. Com `registrarDiferenca`, o que faltou em relação ao
   * que o app esperava vira um registro "Investimentos não registrados" de hoje — entra
   * nos totais e no relatório, mas NÃO desconta do saldo de novo: é gravado
   * um instante antes da nova referência, que já inclui esse dinheiro.
   */
  async function atualizar(
    valorNovo: number,
    saldoEsperado: number | null,
    registrarDiferenca: boolean = false
  ) {
    if (!user) return false;
    const valor = arredondarCentavos(valorNovo);
    const agora = Date.now();
    const faltou = saldoEsperado !== null ? arredondarCentavos(saldoEsperado - valor) : 0;
    try {
      const batch = writeBatch(db);
      batch.set(
        doc(db, "usuarios", user.uid, "saldo", "atual"),
        {
          valor,
          atualizadoEm: agora,
        },
        { merge: true }
      );
      if (registrarDiferenca && faltou > 0) {
        const dia = hojeISO();
        batch.set(doc(collection(db, "usuarios", user.uid, "gastos")), {
          descricao: "Investimentos não registrados",
          valor: faltou,
          categoria: "Não lançado",
          mes: dia.slice(0, 7),
          data: dia,
          criadoEm: agora - 1,
        });
      }
      if (saldoEsperado !== null) {
        const diferenca = arredondarCentavos(valor - saldoEsperado);
        batch.set(doc(collection(db, "usuarios", user.uid, "conciliacoes")), {
          dataISO: hojeISO(),
          saldoInformado: valor,
          saldoEsperado,
          diferenca,
          ajusteCriado: registrarDiferenca && faltou > 0,
          responsavelUid: user.uid,
          ...(user.email ? { responsavelEmail: user.email } : {}),
          criadoEm: agora,
        });
        anexarAuditLog(batch, user.uid, user.email, {
          action: "reconciled",
          entityType: "saldo",
          entityId: "atual",
          summary: `Saldo definido em ${formatarMoeda(valor)} (o app esperava ${formatarMoeda(
            saldoEsperado
          )})`,
          before: { saldoEsperado },
          after: { valor },
        });
      }
      await batch.commit();
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function definirReservaMeta(reservaMeta: number) {
    if (!user) return false;
    try {
      await setDoc(
        doc(db, "usuarios", user.uid, "saldo", "atual"),
        { reservaMeta },
        { merge: true }
      );
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  async function definirPercentualCdi(percentualCdi: number) {
    if (!user) return false;
    try {
      await setDoc(
        doc(db, "usuarios", user.uid, "saldo", "atual"),
        { percentualCdi: Math.max(0, percentualCdi) },
        { merge: true }
      );
      setErro(null);
      return true;
    } catch (e) {
      setErro(mensagemErro(e));
      return false;
    }
  }

  return { saldo, loading, erro, atualizar, definirReservaMeta, definirPercentualCdi };
}
