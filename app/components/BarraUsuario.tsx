"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import Modal from "./Modal";
import ThemeToggle from "./ThemeToggle";
import NotificacoesBotao from "./NotificacoesBotao";
import FeedbackBotao from "./FeedbackBotao";
import OrgaosConteudo from "./OrgaosConteudo";
import HistoricoConteudo from "./HistoricoConteudo";
import PerfilConteudo from "./PerfilConteudo";
import AdminUsuariosConteudo from "./AdminUsuariosConteudo";
import { corPerfil, NOMES_PERFIL, textoAvatarPerfil } from "@/lib/perfil";

type ModalId = "orgaos" | "historico" | "perfil" | "admin" | null;
type TipoPerfil = "admin" | "editor" | "visualizador" | null;

/** Barra de navegação principal (D18): Dashboard → Follow-up → Arquivos como
 * abas (Análise TR saiu da navegação fixa — acessada pelo card do Follow-up).
 * Órgãos, Histórico, Administração e Perfil abrem em modal, sem sair da tela
 * atual. Não aparece na tela de login. */
export default function BarraUsuario() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [tipoPerfil, setTipoPerfil] = useState<TipoPerfil>(null);
  const [ehAdmin, setEhAdmin] = useState(false);
  const [modalAberto, setModalAberto] = useState<ModalId>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function carregarPerfil() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      if (data.user) {
        const { data: perfil } = await supabase
          .from("gp_profiles")
          .select("perfil, nome_completo")
          .eq("id", data.user.id)
          .single();
        setEhAdmin(perfil?.perfil === "admin");
        setNome(perfil?.nome_completo || null);
        setTipoPerfil((perfil?.perfil as TipoPerfil) || null);
      } else {
        setEhAdmin(false);
        setNome(null);
        setTipoPerfil(null);
      }
    }
    carregarPerfil();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      carregarPerfil();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Fecha o modal automaticamente ao navegar (ex.: clicar num órgão dentro
  // do modal de Órgãos abre a página de detalhe /orgaos/[id]).
  useEffect(() => {
    setModalAberto(null);
  }, [pathname]);

  if (pathname === "/" || pathname === "/login" || !email) return null;

  async function sair() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    // D52: ao sair, volta para a página inicial (landing com "Acessar o
    // sistema"). Navegação completa (window.location) para a página atual não
    // disparar seu próprio redirect de 401 para /login no meio do caminho.
    window.location.href = "/";
  }

  const abas = [
    { href: "/dashboard", rotulo: "Dashboard" },
    { href: "/followup", rotulo: "Follow-up" },
    { href: "/arquivos", rotulo: "Arquivos" },
  ];

  const linkEstilo = (ativo?: boolean): React.CSSProperties => ({
    color: "var(--primaria)",
    fontFamily: "var(--fonte-titulo)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
    textDecoration: "none",
    background: "none",
    border: "none",
    cursor: "pointer",
    fontSize: 12,
    padding: 0,
  });

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          padding: "8px 20px",
          background: "var(--escuro)",
          borderBottom: "1px solid #2a2620",
          fontSize: 13,
          color: "#c9c4b6",
          position: "sticky",
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link href="/" title="Voltar à página inicial" style={{ display: "flex", alignItems: "center" }}>
            <Image src="/logo.svg" alt="Logo" width={34} height={34} style={{ borderRadius: 8 }} />
          </Link>
          <nav style={{ display: "flex", gap: 4 }}>
            {abas.map((a) => {
              const ativa = pathname.startsWith(a.href);
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  style={{
                    padding: "8px 14px",
                    borderRadius: 8,
                    fontFamily: "var(--fonte-titulo)",
                    fontWeight: 700,
                    fontSize: 13,
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    textDecoration: "none",
                    color: ativa ? "var(--escuro)" : "var(--primaria)",
                    background: ativa ? "var(--primaria)" : "transparent",
                  }}
                >
                  {a.rotulo}
                </Link>
              );
            })}
          </nav>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => setModalAberto("orgaos")} title="Órgãos cadastrados" style={linkEstilo()}>
            Órgãos
          </button>
          <button onClick={() => setModalAberto("historico")} title="Histórico de análises de TR" style={linkEstilo()}>
            Histórico
          </button>
          {ehAdmin && (
            <button onClick={() => setModalAberto("admin")} title="Administração de usuários" style={linkEstilo()}>
              Administração
            </button>
          )}
          <button
            onClick={() => setModalAberto("perfil")}
            title={`Editar nome, e-mail e senha — ${tipoPerfil ? NOMES_PERFIL[tipoPerfil] : "perfil"}`}
            style={{
              ...linkEstilo(),
              color: "#fff",
              display: "flex",
              alignItems: "center",
              gap: 8,
              textTransform: "none",
              letterSpacing: 0,
            }}
          >
            <span
              style={{
                width: 24,
                height: 24,
                borderRadius: "50%",
                background: corPerfil(tipoPerfil),
                color: textoAvatarPerfil(tipoPerfil),
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 800,
                flexShrink: 0,
              }}
            >
              {(nome || email || "?").trim().charAt(0).toUpperCase()}
            </span>
            {nome || email}
          </button>
          <FeedbackBotao />
          <NotificacoesBotao />
          <ThemeToggle />
          <button
            onClick={sair}
            title="Sair do sistema"
            style={{
              background: "none",
              border: "1px solid #3a3529",
              borderRadius: 8,
              padding: "6px 12px",
              color: "#c9c4b6",
              fontWeight: 600,
              cursor: "pointer",
              fontSize: 13,
            }}
          >
            Sair
          </button>
        </div>
      </div>

      {modalAberto === "orgaos" && (
        <Modal titulo="Órgãos" onFechar={() => setModalAberto(null)}>
          <OrgaosConteudo />
        </Modal>
      )}
      {modalAberto === "historico" && (
        <Modal titulo="Histórico" onFechar={() => setModalAberto(null)}>
          <HistoricoConteudo />
        </Modal>
      )}
      {modalAberto === "admin" && ehAdmin && (
        <Modal titulo="Administração de usuários" onFechar={() => setModalAberto(null)}>
          <AdminUsuariosConteudo />
        </Modal>
      )}
      {modalAberto === "perfil" && (
        <Modal titulo="Meu perfil" onFechar={() => setModalAberto(null)}>
          <PerfilConteudo />
        </Modal>
      )}
    </>
  );
}
