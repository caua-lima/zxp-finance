"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { Nav } from "@/components/Nav";
import { ToastProvider } from "@/components/Toast";
import { useRendimentoAutomatico } from "@/lib/useRendimentoAutomatico";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  // rende o CDI no saldo e nas caixinhas assim que o app abre, em
  // qualquer tela — não depende de visitar Saldo ou Caixinhas
  useRendimentoAutomatico();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login");
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <main className="flex flex-1 items-center justify-center">
        <p className="text-text-faint text-sm">Carregando...</p>
      </main>
    );
  }

  return (
    <ToastProvider>
      <div className="flex flex-1 flex-col md:flex-row">
        <Nav />
        <main className="flex-1 min-w-0 px-4 py-5 pb-[calc(5.25rem+env(safe-area-inset-bottom))] md:px-10 md:py-10 md:pb-10">
          <div className="max-w-3xl mx-auto">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
