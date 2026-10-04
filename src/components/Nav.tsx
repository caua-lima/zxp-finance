"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { Logo } from "./Logo";
import { useModulos, useEhAdmin } from "@/lib/useModulos";
import { useNotificacoes } from "@/lib/useNotificacoes";
import {
  IconResumo,
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
  IconSino,
} from "./icons";

interface ItemNav {
  href: string;
  label: string;
  labelCurto?: string;
  Icon: typeof IconResumo;
  descricao?: string;
}

type Secao = { titulo: string; itens: (ItemNav & { so?: "comissoes" | "admin" })[] };

/**
 * Menu completo (auditoria U04). Comissões só aparece com o módulo ligado
 * (quem trabalha com venda) e Acesso só pra admin da plataforma — esconder
 * não é a proteção (a rota no servidor é), mas cliente comum não precisa
 * ver administração.
 */
const SECOES: Secao[] = [
  {
    titulo: "Visão geral",
    itens: [
      { href: "/", label: "Início", Icon: IconResumo, descricao: "O que entra, o que sai e o que sobra" },
      {
        href: "/dre",
        label: "Relatório mensal",
        labelCurto: "Relatório",
        Icon: IconDre,
        descricao: "Pra onde foi o dinheiro no mês",
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
    titulo: "Dia a dia",
    itens: [
      {
        href: "/saldo",
        label: "Saldo e gastos",
        labelCurto: "Gastos",
        Icon: IconSaldo,
        descricao: "Registrar gasto e ver quanto pode gastar hoje",
      },
      {
        href: "/checklist",
        label: "A pagar",
        Icon: IconChecklist,
        descricao: "O que vence no mês e o que já foi pago",
      },
      {
        href: "/comissoes",
        label: "Comissões",
        Icon: IconComissoes,
        descricao: "Lançar reuniões e vendas do dia",
        so: "comissoes",
      },
      {
        href: "/caixinhas",
        label: "Metas e caixinhas",
        labelCurto: "Metas",
        Icon: IconCaixinha,
        descricao: "Dinheiro guardado e o quanto falta pra meta",
      },
      {
        href: "/chat",
        label: "Anotar por voz",
        labelCurto: "Anotar",
        Icon: IconMicrofone,
        descricao: "Falar ou escrever o que gastou, em conversa",
      },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { href: "/ganhos", label: "Ganhos", Icon: IconGanhos, descricao: "Salário e entradas do mês" },
      { href: "/contas", label: "Contas fixas", Icon: IconContas, descricao: "O que vence todo mês" },
      { href: "/parcelas", label: "Parcelas", Icon: IconParcelas, descricao: "Quanto de parcela você tem ativa" },
      { href: "/assinaturas", label: "Assinaturas", Icon: IconAssinaturas, descricao: "Serviços recorrentes" },
      { href: "/fatura", label: "Cartões", Icon: IconFatura, descricao: "Fatura, fechamento e vencimento de cada cartão" },
    ],
  },
  {
    titulo: "Sua conta",
    itens: [
      { href: "/notificacoes", label: "Notificações", Icon: IconSino, descricao: "Avisos, este aparelho e preferências" },
      { href: "/perfil", label: "Perfil e módulos", labelCurto: "Perfil", Icon: IconPerfil, descricao: "Seu cenário, módulos e exportar dados" },
      { href: "/acesso", label: "Acesso", Icon: IconAcesso, descricao: "Logins da plataforma", so: "admin" },
    ],
  },
];

/**
 * Barra de baixo do celular: Início, Gastos, A pagar e — pra quem usa
 * comissão — Comissões; pra quem não usa, Metas. O resto fica em "Mais".
 */
function tabsMobile(comissoes: boolean): ItemNav[] {
  return [
    { href: "/", label: "Início", Icon: IconResumo },
    { href: "/saldo", label: "Gastos", Icon: IconSaldo },
    { href: "/checklist", label: "A pagar", Icon: IconChecklist },
    comissoes
      ? { href: "/comissoes", label: "Comissões", Icon: IconComissoes }
      : { href: "/caixinhas", label: "Metas", Icon: IconCaixinha },
  ];
}

export function Nav() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const router = useRouter();
  const [menuAberto, setMenuAberto] = useState(false);
  const botaoMais = useRef<HTMLButtonElement>(null);
  const botaoFechar = useRef<HTMLButtonElement>(null);

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
    // foco vai pra dentro da folha e volta pro "Mais" ao fechar (auditoria U02)
    botaoFechar.current?.focus();
    const retorno = botaoMais.current;
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener("keydown", aoTeclar);
      retorno?.focus();
    };
  }, [menuAberto]);

  const modulos = useModulos();
  const admin = useEhAdmin();
  const { naoLidas } = useNotificacoes();
  const secoes = SECOES.map((secao) => ({
    ...secao,
    itens: secao.itens.filter(
      (i) => (i.so !== "comissoes" || modulos.comissoes) && (i.so !== "admin" || admin)
    ),
  }));
  const TABS_MOBILE = tabsMobile(modulos.comissoes);
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
              <p className="px-3 mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-text-faint">
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
      <header className="md:hidden sticky top-0 z-20 flex items-center justify-between border-b border-line bg-sidebar/95 px-4 py-2 backdrop-blur">
        <Logo />
        <Link
          href="/notificacoes"
          aria-label={naoLidas > 0 ? `Notificações: ${naoLidas} não lida(s)` : "Notificações"}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl text-text-muted active:bg-surface"
        >
          <IconSino width={20} height={20} />
          {naoLidas > 0 && (
            <span className="absolute right-1.5 top-1.5 min-w-[18px] rounded-full bg-brand px-1 text-center text-xs font-bold leading-[18px] text-on-brand">
              {naoLidas > 9 ? "9+" : naoLidas}
            </span>
          )}
        </Link>
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
                ref={botaoFechar}
                onClick={() => setMenuAberto(false)}
                className="-mr-2 rounded-lg px-3 py-2 text-sm text-text-muted active:bg-surface"
              >
                Fechar
              </button>
            </div>

            <nav className="px-3 py-2">
              {secoes.map((secao) => (
                <div key={secao.titulo} className="mb-3">
                  <p className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-faint">
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
              aria-label={label}
              aria-current={ativo ? "page" : undefined}
              className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors ${
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
          ref={botaoMais}
          onClick={() => setMenuAberto(true)}
          aria-expanded={menuAberto}
          aria-label="Abrir todas as seções"
          className={`flex min-h-[58px] flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors ${
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
