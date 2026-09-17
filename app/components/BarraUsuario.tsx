"use client";

import { useEffect, useRef, useState } from "react";
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
type Aba = { href: string; rotulo: string; exact?: boolean };

/**
 * Barra de navegação principal. Organizada em três zonas, cada uma com um
 * papel só:
 *
 *   [logo · módulo ▾]   [abas do módulo]            [💬 🔔 🌙]  [avatar ▾]
 *
 * - Módulo: diz em que sistema o usuário está (Propostas ou SADA) e permite
 *   trocar. Antes a troca era silenciosa — as abas mudavam sem nenhum rótulo.
 * - Abas: só navegação do módulo atual, em grupos separados por um divisor.
 * - Conta: tudo o que é do usuário ou abre modal (perfil, órgãos, histórico,
 *   administração, sair) fica no menu do avatar, o padrão que as pessoas já
 *   esperam. Eram cinco controles soltos competindo com as abas.
 *
 * Não aparece na tela de login nem na landing.
 */
export default function BarraUsuario() {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [nome, setNome] = useState<string | null>(null);
  const [tipoPerfil, setTipoPerfil] = useState<TipoPerfil>(null);
  const [ehAdmin, setEhAdmin] = useState(false);
  const [veSada, setVeSada] = useState(false);
  const [modalAberto, setModalAberto] = useState<ModalId>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function carregarPerfil() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      if (data.user) {
        const { data: perfil } = await supabase
          .from("gp_profiles")
          .select("perfil, nome_completo, is_superadmin, pode_ver_sada")
          .eq("id", data.user.id)
          .single();
        setEhAdmin(perfil?.perfil === "admin");
        setNome(perfil?.nome_completo || null);
        setTipoPerfil((perfil?.perfil as TipoPerfil) || null);
        setVeSada(!!(perfil?.is_superadmin || perfil?.pode_ver_sada));
      } else {
        setEhAdmin(false);
        setNome(null);
        setTipoPerfil(null);
        setVeSada(false);
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
    // D52: ao sair, volta para a página inicial. Navegação completa
    // (window.location) para a página atual não disparar seu próprio redirect
    // de 401 para /login no meio do caminho.
    window.location.href = "/";
  }

  // O SADA é um módulo à parte: dentro de /sada as abas trocam para as dele.
  // Grupos: o que se consulta no dia a dia, e o que alimenta a base.
  const emSada = pathname.startsWith("/sada");
  const grupos: Aba[][] = emSada
    ? [
        [
          { href: "/sada", rotulo: "Dashboard", exact: true },
          { href: "/sada/qualidade", rotulo: "Qualidade" },
          { href: "/sada/completude", rotulo: "Completude" },
          { href: "/sada/cnpj", rotulo: "CNPJ" },
        ],
        [
          { href: "/sada/atualizacao", rotulo: "Atualização da dívida" },
          { href: "/sada/depara", rotulo: "DE/PARA" },
        ],
      ]
    : [
        [
          { href: "/dashboard", rotulo: "Dashboard", exact: true },
          { href: "/followup", rotulo: "Follow-up" },
          { href: "/arquivos", rotulo: "Arquivos" },
        ],
      ];

  const nomeExibido = nome || email;
  const papel = tipoPerfil ? NOMES_PERFIL[tipoPerfil] : null;

  return (
    <>
      <header className="barra">
        <div className="barra-inicio">
          <Link href="/" title="Página inicial" className="barra-logo">
            <Image src="/logo.svg" alt="GRUPO BRID" width={30} height={30} style={{ borderRadius: 7 }} />
          </Link>

          {veSada ? (
            <Suspenso
              rotuloAcessivel="Trocar de módulo"
              alinhar="esquerda"
              gatilho={(aberto) => (
                <span className="barra-modulo">
                  {emSada ? "SADA" : "Propostas"}
                  <Seta aberta={aberto} />
                </span>
              )}
            >
              {(fechar) => (
                <>
                  <ItemLink href="/dashboard" ativo={!emSada} onClick={fechar}
                            titulo="Gestão de Propostas" desc="Dashboard, follow-up e arquivos" />
                  <ItemLink href="/sada" ativo={emSada} onClick={fechar}
                            titulo="SADA — Dívida Ativa" desc="Base, qualidade e atualização" />
                </>
              )}
            </Suspenso>
          ) : (
            <span className="barra-modulo estatico">Propostas</span>
          )}
        </div>

        <nav className="barra-abas" aria-label="Navegação do módulo">
          {grupos.map((grupo, gi) => (
            <div key={gi} className="barra-grupo">
              {grupo.map((a) => {
                const ativa = a.exact ? pathname === a.href : pathname.startsWith(a.href);
                return (
                  <Link key={a.href} href={a.href} className="barra-aba"
                        aria-current={ativa ? "page" : undefined}>
                    {a.rotulo}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="barra-fim">
          <div className="barra-icones">
            <FeedbackBotao />
            <NotificacoesBotao />
            <ThemeToggle />
          </div>

          <Suspenso
            rotuloAcessivel="Menu da conta"
            alinhar="direita"
            gatilho={(aberto) => (
              <span className="barra-conta">
                <Avatar tipo={tipoPerfil} texto={nomeExibido} />
                <span className="barra-conta-nome">{nomeExibido}</span>
                <Seta aberta={aberto} />
              </span>
            )}
          >
            {(fechar) => (
              <>
                <div className="suspenso-cabecalho">
                  <Avatar tipo={tipoPerfil} texto={nomeExibido} grande />
                  <div style={{ minWidth: 0 }}>
                    <strong className="suspenso-truncar">{nome || "Sem nome"}</strong>
                    <span className="suspenso-truncar suspenso-desc">{email}</span>
                    {papel && <span className="suspenso-papel">{papel}</span>}
                  </div>
                </div>
                <div className="suspenso-divisor" />
                <ItemBotao titulo="Meu perfil" desc="Nome, e-mail e senha"
                           onClick={() => { fechar(); setModalAberto("perfil"); }} />
                <ItemBotao titulo="Órgãos" desc="Entes cadastrados"
                           onClick={() => { fechar(); setModalAberto("orgaos"); }} />
                <ItemBotao titulo="Histórico" desc="Análises de TR"
                           onClick={() => { fechar(); setModalAberto("historico"); }} />
                {ehAdmin && (
                  <ItemBotao titulo="Administração" desc="Usuários e permissões"
                             onClick={() => { fechar(); setModalAberto("admin"); }} />
                )}
                <div className="suspenso-divisor" />
                <ItemBotao titulo="Sair" perigo onClick={() => { fechar(); sair(); }} />
              </>
            )}
          </Suspenso>
        </div>
      </header>

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

/**
 * Menu suspenso. Fecha ao clicar fora, no Escape (devolvendo o foco ao
 * gatilho, para quem navega por teclado não se perder) e ao escolher um item.
 */
function Suspenso({
  gatilho,
  children,
  rotuloAcessivel,
  alinhar,
}: {
  gatilho: (aberto: boolean) => React.ReactNode;
  children: (fechar: () => void) => React.ReactNode;
  rotuloAcessivel: string;
  alinhar: "esquerda" | "direita";
}) {
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const botao = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const clique = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        botao.current?.focus();
      }
    };
    document.addEventListener("mousedown", clique);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", clique);
      document.removeEventListener("keydown", tecla);
    };
  }, [aberto]);

  return (
    <div ref={raiz} className="suspenso-raiz">
      <button
        ref={botao}
        type="button"
        className="suspenso-gatilho"
        aria-label={rotuloAcessivel}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        {gatilho(aberto)}
      </button>
      {aberto && (
        <div role="menu" className={`suspenso ${alinhar}`}>
          {children(() => setAberto(false))}
        </div>
      )}
    </div>
  );
}

function ItemLink({ href, titulo, desc, ativo, onClick }: {
  href: string; titulo: string; desc?: string; ativo?: boolean; onClick: () => void;
}) {
  return (
    <Link href={href} role="menuitem" className="suspenso-item" onClick={onClick}
          aria-current={ativo ? "page" : undefined}>
      <span>{titulo}</span>
      {desc && <span className="suspenso-desc">{desc}</span>}
    </Link>
  );
}

function ItemBotao({ titulo, desc, perigo, onClick }: {
  titulo: string; desc?: string; perigo?: boolean; onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" onClick={onClick}
            className={`suspenso-item${perigo ? " perigo" : ""}`}>
      <span>{titulo}</span>
      {desc && <span className="suspenso-desc">{desc}</span>}
    </button>
  );
}

function Avatar({ tipo, texto, grande }: { tipo: TipoPerfil; texto: string | null; grande?: boolean }) {
  const tam = grande ? 36 : 28;
  return (
    <span
      aria-hidden
      style={{
        width: tam,
        height: tam,
        borderRadius: "50%",
        background: corPerfil(tipo),
        color: textoAvatarPerfil(tipo),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: grande ? 15 : 12,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      {(texto || "?").trim().charAt(0).toUpperCase()}
    </span>
  );
}

function Seta({ aberta }: { aberta: boolean }) {
  return (
    <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" className="barra-seta"
         style={{ transform: aberta ? "rotate(180deg)" : "none" }}>
      <path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.6"
            strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
