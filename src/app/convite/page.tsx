"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { Logo } from "@/components/Logo";

type Modo = "nova" | "existente";

/** Lê o token do "#t=..." (o fragmento não vai pro servidor). */
function tokenDaUrl(): string | null {
  if (typeof window === "undefined") return null;
  const t = new URLSearchParams(window.location.hash.slice(1)).get("t");
  return t && /^[A-Za-z0-9_-]{43}$/.test(t) ? t : null;
}

/**
 * Aceitar convite da mentoria (auditoria 25/10 B12). Quem não tem conta
 * cria com e-mail e senha; quem tem, entra e o convite passa a valer pra
 * ela. Logado, é um toque só. Sem convite válido, nada é criado.
 */
export default function ConvitePage() {
  const { user, login } = useAuth();
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [lido, setLido] = useState(false);
  const [modo, setModo] = useState<Modo>("nova");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);
  const refErro = useRef<HTMLParagraphElement>(null);

  // o hash só existe no navegador: lido depois de montar, e de novo se a
  // pessoa colar outro link com a tela aberta (só o "#" muda, sem recarregar)
  useEffect(() => {
    const ler = () => {
      setToken(tokenDaUrl());
      setErro("");
      setLido(true);
    };
    ler();
    window.addEventListener("hashchange", ler);
    return () => window.removeEventListener("hashchange", ler);
  }, []);

  useEffect(() => {
    if (erro) refErro.current?.focus();
  }, [erro]);

  async function aceitar(corpo: Record<string, string>, idToken?: string) {
    const r = await fetch("/api/convites/aceitar", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify(corpo),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.erro ?? "Não deu pra aceitar o convite agora. Tente de novo.");
  }

  async function aceitarLogado() {
    if (!user || !token) return;
    setErro("");
    setEnviando(true);
    try {
      await aceitar({ token }, await user.getIdToken());
      // token novo: a concessão recém-criada passa a valer nas regras
      await user.getIdToken(true);
      router.replace("/");
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao aceitar o convite.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setErro("");
    setEnviando(true);
    try {
      if (modo === "nova") {
        await aceitar({ token, email: email.trim(), senha });
        await login(email.trim(), senha);
      } else {
        await login(email.trim(), senha);
        // o login dispara a tela de "logado"; o aceite segue por ela
        return;
      }
      router.replace("/");
    } catch (e) {
      const codigo = (e as { code?: string })?.code ?? "";
      setErro(
        codigo.startsWith("auth/")
          ? codigo === "auth/network-request-failed"
            ? "Sem conexão. Confira sua internet e tente de novo."
            : "E-mail ou senha incorretos."
          : e instanceof Error
            ? e.message
            : "Erro ao aceitar o convite."
      );
    } finally {
      setEnviando(false);
    }
  }

  const caixaErro = (
    <div aria-live="polite">
      {erro && (
        <p ref={refErro} tabIndex={-1} className="text-sm text-negative outline-none">
          {erro}
        </p>
      )}
    </div>
  );

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <div className="space-y-4 rounded-2xl border border-line bg-surface p-6">
          <h1 className="text-center text-base font-semibold">Convite pro ZXP Finance</h1>

          {!lido ? (
            <p className="text-center text-sm text-text-muted">Abrindo o convite…</p>
          ) : !token ? (
            <p className="text-sm text-text-muted">
              Esse link de convite não está completo. Abra de novo o link que você recebeu, sem cortar
              nenhuma parte, ou peça um novo a quem cuida da sua turma.
            </p>
          ) : user ? (
            <>
              <p className="text-sm text-text-muted">
                Você está conectado como <span className="font-medium text-text">{user.email}</span>. O
                acesso do convite vai valer pra esta conta.
              </p>
              {caixaErro}
              <button
                type="button"
                onClick={aceitarLogado}
                disabled={enviando}
                className="min-h-[46px] w-full rounded-xl bg-brand text-sm font-semibold text-on-brand disabled:opacity-50"
              >
                {enviando ? "Aceitando..." : "Aceitar convite"}
              </button>
            </>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div role="radiogroup" aria-label="Você já tem conta?" className="grid grid-cols-2 gap-1.5">
                {(["nova", "existente"] as Modo[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={modo === m}
                    onClick={() => setModo(m)}
                    className={`min-h-[42px] rounded-xl border text-xs font-medium ${
                      modo === m ? "border-brand bg-brand-soft text-brand" : "border-line text-text-faint"
                    }`}
                  >
                    {m === "nova" ? "Criar minha conta" : "Já tenho conta"}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="convite-email" className="rotulo">
                  E-mail
                </label>
                <input
                  id="convite-email"
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="campo"
                />
              </div>
              <div>
                <label htmlFor="convite-senha" className="rotulo">
                  {modo === "nova" ? "Crie uma senha (8+ caracteres)" : "Senha"}
                </label>
                <input
                  id="convite-senha"
                  type="password"
                  autoComplete={modo === "nova" ? "new-password" : "current-password"}
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  className="campo"
                />
              </div>
              {caixaErro}
              <button
                type="submit"
                disabled={enviando || !email.trim() || (modo === "nova" ? senha.length < 8 : !senha)}
                className="min-h-[46px] w-full rounded-xl bg-brand text-sm font-semibold text-on-brand disabled:opacity-50"
              >
                {enviando ? "Um instante..." : modo === "nova" ? "Criar conta e entrar" : "Entrar"}
              </button>
              <p className="text-center text-xs text-text-muted">
                O convite vale uma vez. Seus dados financeiros são só seus: quem cuida da turma vê o
                acesso, não as suas finanças.
              </p>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
