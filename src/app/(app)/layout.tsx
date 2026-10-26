"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { Nav } from "@/components/Nav";
import { ToastProvider } from "@/components/Toast";
import { SemConexao } from "@/components/SemConexao";
import { useConfigApp } from "@/lib/useConfigApp";
import { useAcesso } from "@/lib/useAcesso";
import { AcessoBloqueado } from "@/components/AcessoBloqueado";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { versao } = useConfigApp();
  const acesso = useAcesso();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  // espera a configuração do cliente (imposto, início do histórico) pra não
  // renderizar cálculo com valor errado e trocar logo depois
  if (loading || !user || !versao || !acesso) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-text-faint text-sm">Carregando...</p>
      </main>
    );
  }

  // sem acesso liberado: explica o motivo em vez de telas com erro de permissão
  if (!acesso.liberado && acesso.motivo) return <AcessoBloqueado motivo={acesso.motivo} />;

  return (
    <ToastProvider>
      <div className="flex flex-1 flex-col md:flex-row">
        <Nav />
        <main className="flex-1 min-w-0 px-4 py-5 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:px-10 md:py-10 md:pb-10">
          {/* key pelo uid: trocar de conta remonta todas as telas, sem sobrar
              lista, erro ou carregamento da conta anterior (auditoria U06) */}
          <SemConexao />
          <div key={`${user.uid}:${versao}`} className="max-w-3xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
