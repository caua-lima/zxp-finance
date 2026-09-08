"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { Logo } from "@/components/Logo";

export default function LoginPage() {
  const { login, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  if (user) {
    router.replace("/");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    try {
      await login(email, senha);
      router.replace("/");
    } catch {
      setErro("E-mail ou senha inválidos.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-8">
          <Logo size="lg" />
        </div>
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-[0_0_0_1px_rgba(23,195,162,0.04),0_20px_60px_-20px_rgba(0,0,0,0.6)]"
        >
          <p className="text-sm text-text-muted text-center">
            Entre para ver seu controle financeiro
          </p>
          <div className="space-y-2">
            <input
              type="email"
              required
              placeholder="E-mail"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="campo"
            />
            <input
              type="password"
              required
              placeholder="Senha"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="campo"
            />
          </div>
          {erro && <p className="text-sm text-negative">{erro}</p>}
          <button
            type="submit"
            disabled={enviando}
            className="w-full rounded-lg bg-brand py-2 text-sm font-medium text-on-brand hover:bg-brand-dark disabled:opacity-50 transition-colors"
          >
            {enviando ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
