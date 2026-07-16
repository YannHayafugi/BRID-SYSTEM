"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

interface Profile {
  id: string;
  email: string;
  nome_completo: string | null;
  perfil: "admin" | "editor" | "visualizador";
  pode_editar_analises: boolean;
  pode_excluir_analises: boolean;
  ativo: boolean;
}

export default function AdminUsuariosPage() {
  const [carregando, setCarregando] = useState(true);
  const [autorizado, setAutorizado] = useState<boolean | null>(null);
  const [usuarios, setUsuarios] = useState<Profile[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [novoEmail, setNovoEmail] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [novoNome, setNovoNome] = useState("");
  const [novoPerfil, setNovoPerfil] = useState<Profile["perfil"]>("visualizador");
  const [novoPodeEditar, setNovoPodeEditar] = useState(false);
  const [novoPodeExcluir, setNovoPodeExcluir] = useState(false);
  const [criando, setCriando] = useState(false);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        setAutorizado(false);
        return;
      }
      const { data: meuProfile } = await supabase
        .from("gp_profiles")
        .select("perfil")
        .eq("id", data.user.id)
        .single();

      if (meuProfile?.perfil !== "admin") {
        setAutorizado(false);
        return;
      }
      setAutorizado(true);

      const resp = await fetch("/api/admin/users");
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || "Falha ao carregar usuários.");
      setUsuarios(dados.usuarios);
    } catch (err: any) {
      setErro(err.message || "Erro ao carregar usuários.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function criarUsuario() {
    setErro(null);
    setMensagem(null);
    if (!novoEmail.trim() || !novaSenha.trim()) {
      setErro("E-mail e senha são obrigatórios.");
      return;
    }
    setCriando(true);
    try {
      const resp = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: novoEmail.trim(),
          senha: novaSenha,
          nomeCompleto: novoNome.trim() || null,
          perfil: novoPerfil,
          podeEditarAnalises: novoPodeEditar,
          podeExcluirAnalises: novoPodeExcluir,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || "Falha ao criar usuário.");
      setMensagem("Usuário criado com sucesso.");
      setNovoEmail("");
      setNovaSenha("");
      setNovoNome("");
      setNovoPerfil("visualizador");
      setNovoPodeEditar(false);
      setNovoPodeExcluir(false);
      carregar();
    } catch (err: any) {
      setErro(err.message || "Erro ao criar usuário.");
    } finally {
      setCriando(false);
    }
  }

  async function atualizarUsuario(id: string, campos: Partial<Profile>) {
    setErro(null);
    try {
      const resp = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          perfil: campos.perfil,
          podeEditarAnalises: campos.pode_editar_analises,
          podeExcluirAnalises: campos.pode_excluir_analises,
          ativo: campos.ativo,
        }),
      });
      const dados = await resp.json();
      if (!resp.ok) throw new Error(dados.erro || "Falha ao atualizar usuário.");
      setUsuarios((prev) => prev.map((u) => (u.id === id ? { ...u, ...campos } : u)));
    } catch (err: any) {
      setErro(err.message || "Erro ao atualizar usuário.");
    }
  }

  if (carregando) {
    return (
      <main>
        <div className="page">
          <p>Carregando...</p>
        </div>
      </main>
    );
  }

  if (!autorizado) {
    return (
      <main>
        <header className="topo">
          <h1>Acesso restrito</h1>
        </header>
        <div className="page">
          <p>Esta página é exclusiva para administradores.</p>
          <Link href="/orgaos">← voltar</Link>
        </div>
      </main>
    );
  }

  return (
    <main>
      <header className="topo">
        <h1>Administração de usuários</h1>
      </header>

      <div className="page">
        <p style={{ marginBottom: 20 }}>
          <Link href="/orgaos">← voltar</Link>
        </p>

        <section className="card">
          <h2>Criar novo usuário</h2>
          <div className="grid">
            <div className="field">
              <label>E-mail *</label>
              <input value={novoEmail} onChange={(e) => setNovoEmail(e.target.value)} type="email" />
            </div>
            <div className="field">
              <label>Senha provisória *</label>
              <input value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} type="text" />
              <small>Mínimo 6 caracteres. Repasse ao usuário para o primeiro acesso.</small>
            </div>
            <div className="field">
              <label>Nome completo</label>
              <input value={novoNome} onChange={(e) => setNovoNome(e.target.value)} />
            </div>
            <div className="field">
              <label>Perfil *</label>
              <select value={novoPerfil} onChange={(e) => setNovoPerfil(e.target.value as Profile["perfil"])}>
                <option value="visualizador">Visualizador (só consulta)</option>
                <option value="editor">Editor (analisa e gera relatórios)</option>
                <option value="admin">Administrador (acesso total)</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 20, marginTop: 10 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={novoPodeEditar} onChange={(e) => setNovoPodeEditar(e.target.checked)} />
              Pode editar análises salvas
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
              <input type="checkbox" checked={novoPodeExcluir} onChange={(e) => setNovoPodeExcluir(e.target.checked)} />
              Pode excluir análises salvas
            </label>
          </div>
          <div className="actions">
            <button className="btn" onClick={criarUsuario} disabled={criando}>
              {criando ? "Criando..." : "Criar usuário"}
            </button>
            {erro && <span className="msg erro">{erro}</span>}
            {mensagem && <span className="msg ok">{mensagem}</span>}
          </div>
        </section>

        <section className="card">
          <h2>Usuários cadastrados ({usuarios.length})</h2>
          {usuarios.map((u) => (
            <div className="item-analise" key={u.id}>
              <div className="item-analise-cabecalho">
                <span className="etapa-badge">{u.email}</span>
                <span>{u.nome_completo}</span>
              </div>
              <div className="grid" style={{ marginTop: 8 }}>
                <div className="field">
                  <label>Perfil</label>
                  <select
                    value={u.perfil}
                    onChange={(e) => atualizarUsuario(u.id, { perfil: e.target.value as Profile["perfil"] })}
                  >
                    <option value="visualizador">Visualizador</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={u.pode_editar_analises}
                    onChange={(e) => atualizarUsuario(u.id, { pode_editar_analises: e.target.checked })}
                  />
                  Pode editar análises salvas
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={u.pode_excluir_analises}
                    onChange={(e) => atualizarUsuario(u.id, { pode_excluir_analises: e.target.checked })}
                  />
                  Pode excluir análises salvas
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={u.ativo}
                    onChange={(e) => atualizarUsuario(u.id, { ativo: e.target.checked })}
                  />
                  Ativo
                </label>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
