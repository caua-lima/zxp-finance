"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { Logo } from "@/components/Logo";

/** Erro de rede/limite é diferente de credencial errada — mas sem revelar se a conta existe. */
function mensagemDeLogin(e: unknown): string {
  const codigo = (e as { code?: string })?.code ?? "";
  if (codigo === "auth/network-request-failed") {
    return "Sem conexão com o servidor. Confira sua internet e tente de novo.";
  }
  if (codigo === "auth/too-many-requests") {
    return "Muitas tentativas seguidas. Espere alguns minutos ou redefina a senha.";
  }
  if (codigo === "auth/user-disabled") {
    return "Este acesso está suspenso. Fale com quem administra o app.";
  }
  return "E-mail ou senha incorretos.";
}

/**
 * Login (auditoria U01): rótulos de verdade (não só placeholder),
 * autocomplete certo pro gerenciador de senhas, mostrar/ocultar senha,
 * recuperação por e-mail, erro de conexão separado de credencial errada,
 * e redirecionamento num efeito (antes era feito durante o render).
 */
export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [enviando, setEnviando] = useState(false);
  const refErro = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (user) router.replace("/");
  }, [user, router]);

  useEffect(() => {
    if (erro) refErro.current?.focus();
  }, [erro]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setAviso("");
    setEnviando(true);
    try {
      await login(email.trim(), senha);
      router.replace("/");
    } catch (e) {
      setErro(mensagemDeLogin(e));
    } finally {
      setEnviando(false);
    }
  }

  async function esqueciSenha() {
    setErro("");
    setAviso("");
    if (!email.trim()) {
      setErro("Digite seu e-mail acima e toque de novo em “Esqueci minha senha”.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (e) {
      if ((e as { code?: string })?.code === "auth/network-request-failed") {
        setErro(mensagemDeLogin(e));
        return;
      }
      // qualquer outro erro cai na mesma mensagem abaixo — não revela se
      // existe conta com esse e-mail
    }
    setAviso("Se existir uma conta com esse e-mail, o link pra criar uma senha nova chega em alguns minutos.");
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Logo size="lg" />
        </div>
        <form
          onSubmit={handleSubmit}
          noValidate
          className="space-y-4 rounded-2xl border border-line bg-surface p-6"
        >
          <h1 className="text-center text-base font-semibold">Entrar no ZXP Finance</h1>

          <div>
            <label htmlFor="login-email" className="rotulo">
              E-mail
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="campo"
            />
          </div>

          <div>
            <label htmlFor="login-senha" className="rotulo">
              Senha
            </label>
            <div className="relative">
              <input
                id="login-senha"
                type={mostrarSenha ? "text" : "password"}
                required
                autoComplete="current-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                className="campo pr-20"
              />
              <button
                type="button"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-pressed={mostrarSenha}
                aria-controls="login-senha"
                className="absolute inset-y-0 right-1 my-1 rounded-lg px-3 text-xs font-medium text-brand"
              >
                {mostrarSenha ? "Ocultar" : "Mostrar"}
              </button>
            </div>
          </div>

          <div aria-live="polite">
            {erro && (
              <p ref={refErro} tabIndex={-1} className="text-sm text-negative outline-none">
                {erro}
              </p>
            )}
            {aviso && <p className="text-sm text-positive">{aviso}</p>}
          </div>

          <button
            type="submit"
            disabled={enviando || !email.trim() || !senha}
            className="min-h-[46px] w-full rounded-xl bg-brand text-sm font-semibold text-on-brand transition-colors hover:bg-brand-dark disabled:opacity-50"
          >
            {enviando ? "Entrando..." : "Entrar"}
          </button>

          <button
            type="button"
            onClick={esqueciSenha}
            className="w-full py-1 text-sm font-medium text-brand"
          >
            Esqueci minha senha
          </button>

          <p className="text-center text-xs text-text-muted">
            O acesso é por convite. Se você ainda não tem login, peça pra quem administra o app.
          </p>
        </form>
      </div>
    </main>
  );
}
