"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { Logo } from "./Logo";
import {
  IconResumo,
  IconAgenda,
  IconSaldo,
  IconGanhos,
  IconContas,
  IconParcelas,
  IconAssinaturas,
  IconFatura,
  IconChecklist,
  IconDre,
  IconAcesso,
  IconSair,
} from "./icons";

const secoes = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/", label: "Resumo", Icon: IconResumo },
      { href: "/agenda", label: "Agenda", Icon: IconAgenda },
    ],
  },
  {
    titulo: "Movimentações",
    itens: [
      { href: "/saldo", label: "Saldo e gastos", labelMobile: "Saldo", Icon: IconSaldo },
      { href: "/ganhos", label: "Ganhos", Icon: IconGanhos },
      { href: "/contas", label: "Contas", Icon: IconContas },
      { href: "/parcelas", label: "Parcelas", Icon: IconParcelas },
      { href: "/assinaturas", label: "Assinaturas", Icon: IconAssinaturas },
      {
        href: "/fatura",
        label: "Fatura do cartão",
        labelMobile: "Fatura",
        Icon: IconFatura,
      },
    ],
  },
  {
    titulo: "Análise",
    itens: [{ href: "/dre", label: "DRE", Icon: IconDre }],
  },
  {
    titulo: "Sistema",
    itens: [
      { href: "/checklist", label: "Checklist", Icon: IconChecklist },
      { href: "/acesso", label: "Acesso", Icon: IconAcesso },
    ],
  },
];

const linksFlat = secoes.flatMap((s) => s.itens);

export function Nav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <>
      {/* Sidebar — desktop */}
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-[248px] md:shrink-0 md:flex-col md:border-r md:border-line md:bg-sidebar md:px-3 md:py-5">
        <div className="px-2 mb-6">
          <Logo />
        </div>
        <nav className="flex flex-col gap-4 overflow-y-auto">
          {secoes.map((secao) => (
            <div key={secao.titulo}>
              <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint">
                {secao.titulo}
              </p>
              <div className="flex flex-col gap-0.5">
                {secao.itens.map(({ href, label, Icon }) => {
                  const ativo = pathname === href;
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`flex items-center gap-3 rounded-lg border-l-[3px] px-2.5 py-2 text-sm font-medium transition-colors ${
                        ativo
                          ? "border-brand bg-surface-2 text-brand"
                          : "border-transparent text-text-muted hover:bg-surface hover:text-text"
                      }`}
                    >
                      <Icon />
                      {label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <button
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          <IconSair />
          Sair
        </button>
      </aside>

      {/* Header — mobile */}
      <header className="md:hidden flex items-center justify-between border-b border-line bg-sidebar px-4 py-3">
        <Logo />
        <button
          onClick={handleLogout}
          className="text-sm text-text-muted hover:text-text"
        >
          Sair
        </button>
      </header>

      {/* Tab bar — mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-10 flex overflow-x-auto border-t border-line bg-sidebar/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {linksFlat.map(({ href, label, labelMobile, Icon }) => {
          const ativo = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={`flex w-16 shrink-0 flex-col items-center gap-1 py-2.5 text-[11px] whitespace-nowrap transition-colors ${
                ativo ? "text-brand" : "text-text-faint"
              }`}
            >
              <Icon width={20} height={20} />
              {labelMobile ?? label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
