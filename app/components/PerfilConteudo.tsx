"use client";

/** Conteúdo de "Meu perfil" (D17) — reaproveitado pela página /perfil e pelo
 * modal aberto a partir do header (D18). */
import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { corPerfil, NOMES_PERFIL, textoAvatarPerfil } from "@/lib/perfil";

export default function PerfilConteudo() {
  const [carregando, setCarregando] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  const [nome, setNome] = useState("");
  const [tipoPerfil, setTipoPerfil] = useState<string | null>(null);
  const [emailAtual, setEmailAtual] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmarSenha, setConfirmarSenha] = useState("");

  const [salvandoNome, setSalvandoNome] = useState(false);
  const [salvandoEmail, setSalvandoEmail] = useState(false);
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  useEffect(() => {
    (async () => {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        window.location.href = "/login";
        return;
      }
      setUserId(data.user.id);
      setEmailAtual(data.user.email || "");
      setEmail(data.user.email || "");
      const { data: perfil } = await supabase
        .from("gp_profiles")
        .select("nome_completo, perfil")
        .eq("id", data.user.id)
        .single();
      setNome(perfil?.nome_completo || "");
      setTipoPerfil(perfil?.perfil || null);
      setCarregando(false);
    })();
  }, []);

  async function salvarNome(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setMsg(null);
    setSalvandoNome(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase
        .from("gp_profiles")
        .update({ nome_completo: nome.trim(), updated_at: new Date().toISOString() })
        .eq("id", userId);
      if (error) throw new Error(error.message);
      setMsg({ tipo: "ok", texto: "Nome atualizado." });
    } catch (err: any) {
      setMsg({ tipo: "erro", texto: err.message || "Falha ao salvar o nome." });
    } finally {
      setSalvandoNome(false);
    }
  }

  async function salvarEmail(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!email.trim() || email.trim() === emailAtual) return;
    setSalvandoEmail(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ email: email.trim() });
      if (error) throw new Error(error.message);
      setMsg({
        tipo: "ok",
        texto: "Enviamos um link de confirmação para o novo e-mail — o e-mail só troca depois que você confirmar.",
      });
    } catch (err: any) {
      setMsg({ tipo: "erro", texto: err.message || "Falha ao atualizar o e-mail." });
    } finally {
      setSalvandoEmail(false);
    }
  }

  async function salvarSenha(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (senha.length < 6) {
      setMsg({ tipo: "erro", texto: "A senha precisa ter pelo menos 6 caracteres." });
      return;
    }
    if (senha !== confirmarSenha) {
      setMsg({ tipo: "erro", texto: "As senhas não coincidem." });
      return;
    }
    setSalvandoSenha(true);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password: senha });
      if (error) throw new Error(error.message);
      setSenha("");
      setConfirmarSenha("");
      setMsg({ tipo: "ok", texto: "Senha alterada." });
    } catch (err: any) {
      setMsg({ tipo: "erro", texto: err.message || "Falha ao alterar a senha." });
    } finally {
      setSalvandoSenha(false);
    }
  }

  if (carregando) return <p>Carregando...</p>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span
          style={{
            width: 44, height: 44, borderRadius: "50%",
            background: corPerfil(tipoPerfil), color: textoAvatarPerfil(tipoPerfil),
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, flexShrink: 0,
          }}
        >
          {(nome || emailAtual || "?").trim().charAt(0).toUpperCase()}
        </span>
        <div>
          <strong style={{ display: "block" }}>{nome || emailAtual}</strong>
          <span className="detalhe">{tipoPerfil ? NOMES_PERFIL[tipoPerfil] || tipoPerfil : "Perfil"}</span>
        </div>
      </div>

      {msg && (
        <p className={`msg ${msg.tipo}`} style={{ marginBottom: 16 }}>
          {msg.texto}
        </p>
      )}

      <section className="card">
        <h2>Nome</h2>
        <form onSubmit={salvarNome}>
          <div className="field">
            <label>Nome completo</label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Seu nome"
              name="nome_completo"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
            />
          </div>
          <div className="actions">
            <button className="btn" type="submit" disabled={salvandoNome}>
              {salvandoNome ? "Salvando..." : "Salvar nome"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>E-mail</h2>
        <form onSubmit={salvarEmail}>
          <div className="field">
            <label>E-mail</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              name="email_conta"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore
            />
          </div>
          <div className="actions">
            <button className="btn" type="submit" disabled={salvandoEmail || email.trim() === emailAtual}>
              {salvandoEmail ? "Enviando..." : "Alterar e-mail"}
            </button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2>Senha</h2>
        <form onSubmit={salvarSenha}>
          <div className="field">
            <label>Nova senha</label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              autoComplete="new-password"
            />
          </div>
          <div className="field" style={{ marginTop: 10 }}>
            <label>Confirmar nova senha</label>
            <input
              type="password"
              value={confirmarSenha}
              onChange={(e) => setConfirmarSenha(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="actions">
            <button className="btn" type="submit" disabled={salvandoSenha}>
              {salvandoSenha ? "Salvando..." : "Alterar senha"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
