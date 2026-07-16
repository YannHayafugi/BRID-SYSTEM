"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
    <main>
      <header className="topo">
        <h1>Gerador de Propostas – Securitização</h1>
        <p>FIA – Fundação Instituto de Administração</p>
      </header>

      <div className="page" style={{ maxWidth: 420 }}>
        <section className="card">
          <h2>Entrar</h2>
          <form onSubmit={entrar}>
            <div className="field">
              <label>E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div className="field" style={{ marginTop: 10 }}>
              <label>Senha</label>
              <input
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
            </div>
            <div className="actions">
              <button className="btn" type="submit" disabled={entrando}>
                {entrando ? "Entrando..." : "Entrar"}
              </button>
              {erro && <span className="msg erro">{erro}</span>}
            </div>
          </form>
          <p style={{ fontSize: 12, color: "#667085", marginTop: 16 }}>
            Não tem uma conta? Peça a um administrador do sistema para criar seu acesso.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
