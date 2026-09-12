"use client";

import { useEffect, useState } from "react";
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
  IconComissoes,
  IconMicrofone,
  IconPerfil,
  IconMais,
  IconCaixinha,
  IconConsultor,
  IconSair,
} from "./icons";

interface ItemNav {
  href: string;
  label: string;
  labelCurto?: string;
  Icon: typeof IconResumo;
  descricao?: string;
}

const secoes: { titulo: string; itens: ItemNav[] }[] = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/", label: "Resumo", Icon: IconResumo, descricao: "Saldo, entradas e alertas" },
      { href: "/agenda", label: "Agenda", Icon: IconAgenda, descricao: "Tudo que vence, em ordem" },
    ],
  },
  {
    titulo: "Dia a dia",
    itens: [
      {
        href: "/chat",
        label: "Anotar gasto",
        labelCurto: "Anotar",
        Icon: IconMicrofone,
        descricao: "Falar ou escrever o que gastou",
      },
      {
        href: "/saldo",
        label: "Saldo e gastos",
        labelCurto: "Saldo",
        Icon: IconSaldo,
        descricao: "Registrar gasto e ver quanto pode gastar",
      },
      {
        href: "/comissoes",
        label: "Comissões",
        Icon: IconComissoes,
        descricao: "Lançar reuniões e vendas do dia",
      },
      {
        href: "/checklist",
        label: "Checklist",
        Icon: IconChecklist,
        descricao: "Marcar contas conforme for pagando",
      },
      {
        href: "/caixinhas",
        label: "Caixinhas",
        Icon: IconCaixinha,
        descricao: "Guarda um trocado a cada gasto registrado",
      },
      {
        href: "/consultor",
        label: "Consultor",
        Icon: IconConsultor,
        descricao: "Pergunte se dá pra assumir um novo compromisso",
      },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/ganhos", label: "Ganhos", Icon: IconGanhos, descricao: "Salário e entradas do mês" },
      { href: "/contas", label: "Contas fixas", labelCurto: "Contas", Icon: IconContas, descricao: "O que vence todo mês" },
      { href: "/parcelas", label: "Parcelas", Icon: IconParcelas, descricao: "Compras parceladas e financiamentos" },
      { href: "/assinaturas", label: "Assinaturas", Icon: IconAssinaturas, descricao: "Serviços recorrentes" },
      { href: "/fatura", label: "Fatura do cartão", labelCurto: "Fatura", Icon: IconFatura, descricao: "Valor e vencimento de cada cartão" },
    ],
  },
  {
    titulo: "Análise e conta",
    itens: [
      { href: "/dre", label: "DRE do mês", labelCurto: "DRE", Icon: IconDre, descricao: "Pra onde foi o dinheiro" },
      { href: "/perfil", label: "Perfil", Icon: IconPerfil, descricao: "Seu cenário, pra comparar com médias" },
      { href: "/acesso", label: "Acesso", Icon: IconAcesso, descricao: "Logins que entram no app" },
    ],
  },
];

/**
 * Barra de baixo do celular: só o que é usado no dia a dia. O resto vive
 * atrás de "Mais" — antes eram 13 itens num scroll horizontal, onde achar
 * qualquer coisa dava trabalho e nada ficava visível de primeira.
 */
const TABS_MOBILE: ItemNav[] = [
  { href: "/", label: "Resumo", Icon: IconResumo },
  { href: "/chat", label: "Anotar", Icon: IconMicrofone },
  { href: "/saldo", label: "Saldo", Icon: IconSaldo },
  { href: "/comissoes", label: "Comissões", Icon: IconComissoes },
];

export function Nav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);

  async function handleLogout() {
    setMenuAberto(false);
    await logout();
    router.replace("/login");
  }

  // trava o scroll do fundo e fecha no Esc enquanto o menu está aberto
  useEffect(() => {
    if (!menuAberto) return;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuAberto(false);
    }
    window.addEventListener("keydown", aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", aoTeclar);
    };
  }, [menuAberto]);

  const emTabPrincipal = TABS_MOBILE.some((t) => t.href === pathname);

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
                      aria-current={ativo ? "page" : undefined}
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
      <header className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-sidebar/95 px-4 py-3 backdrop-blur">
        <Logo />
      </header>

      {/* Menu "Mais" — mobile */}
      {menuAberto && (
        <div className="md:hidden fixed inset-0 z-40 flex flex-col justify-end">
          <button
            aria-label="Fechar menu"
            onClick={() => setMenuAberto(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Mais seções"
            className="relative max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-line bg-sidebar pb-[calc(env(safe-area-inset-bottom)+1rem)] shadow-2xl"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-line-soft bg-sidebar px-5 pb-3 pt-4">
              <span className="text-sm font-semibold">Todas as seções</span>
              <button
                onClick={() => setMenuAberto(false)}
                className="-mr-2 rounded-lg px-3 py-2 text-sm text-text-muted active:bg-surface"
              >
                Fechar
              </button>
            </div>

            <nav className="px-3 py-2">
              {secoes.map((secao) => (
                <div key={secao.titulo} className="mb-3">
                  <p className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-faint">
                    {secao.titulo}
                  </p>
                  <div className="flex flex-col">
                    {secao.itens.map(({ href, label, Icon, descricao }) => {
                      const ativo = pathname === href;
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMenuAberto(false)}
                          aria-current={ativo ? "page" : undefined}
                          className={`flex min-h-[56px] items-center gap-3 rounded-xl px-2 py-2 transition-colors ${
                            ativo ? "bg-surface-2" : "active:bg-surface"
                          }`}
                        >
                          <span
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                              ativo ? "bg-brand text-on-brand" : "bg-surface text-text-muted"
                            }`}
                          >
                            <Icon width={19} height={19} />
                          </span>
                          <span className="min-w-0">
                            <span
                              className={`block text-sm font-medium ${
                                ativo ? "text-brand" : "text-text"
                              }`}
                            >
                              {label}
                            </span>
                            {descricao && (
                              <span className="block truncate text-xs text-text-faint">
                                {descricao}
                              </span>
                            )}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              <button
                onClick={handleLogout}
                className="mt-1 flex min-h-[56px] w-full items-center gap-3 rounded-xl px-2 py-2 text-left active:bg-surface"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface text-negative">
                  <IconSair width={19} height={19} />
                </span>
                <span className="text-sm font-medium text-negative">Sair da conta</span>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Tab bar — mobile */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-line bg-sidebar/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
        {TABS_MOBILE.map(({ href, label, Icon }) => {
          const ativo = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? "page" : undefined}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
                ativo ? "text-brand" : "text-text-faint active:text-text-muted"
              }`}
            >
              <span
                className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
                  ativo ? "bg-brand-soft" : ""
                }`}
              >
                <Icon width={20} height={20} />
              </span>
              <span className="truncate max-w-full">{label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMenuAberto(true)}
          aria-expanded={menuAberto}
          aria-label="Abrir todas as seções"
          className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium transition-colors ${
            menuAberto || !emTabPrincipal ? "text-brand" : "text-text-faint active:text-text-muted"
          }`}
        >
          <span
            className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${
              menuAberto || !emTabPrincipal ? "bg-brand-soft" : ""
            }`}
          >
            <IconMais width={20} height={20} />
          </span>
          <span>Mais</span>
        </button>
      </nav>
    </>
  );
}
