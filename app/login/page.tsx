"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import ThemeToggle from "@/app/components/ThemeToggle";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(
    searchParams.get("erro") === "inativo"
      ? "Sua conta ainda não foi ativada por um administrador. Fale com quem cuida do sistema."
      : null
  );

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEntrando(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) {
        throw new Error(
          error.message === "Invalid login credentials" ? "E-mail ou senha inválidos." : error.message
        );
      }
      const proximo = searchParams.get("proximo") || "/";
      router.replace(proximo);
      router.refresh();
    } catch (err: any) {
      setErro(err.message || "Erro inesperado ao entrar.");
    } finally {
      setEntrando(false);
    }
  }

  return (
    <div id="tela-login">
      <div style={{ position: "fixed", top: 16, right: 16 }}>
        <ThemeToggle variante="auto" />
      </div>
      <div className="card-login">
        <img src="/logo.svg" alt="Logo" className="logo" />
        <h1>Gerador de Propostas</h1>
        <p className="sub">Acesse com seu e-mail e senha</p>
        <form onSubmit={entrar}>
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
          <button type="submit" disabled={entrando}>
            {entrando ? "Entrando..." : "Entrar"}
          </button>
          {erro && <p className="erro-texto">{erro}</p>}
        </form>
        <p style={{ fontSize: 12, color: "#667085", marginTop: 16 }}>
          Não tem uma conta? Peça a um administrador do sistema para criar seu acesso.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
