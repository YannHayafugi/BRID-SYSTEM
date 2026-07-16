"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

/** Barra fina no topo com o menu de navegação, o e-mail do usuário logado e
 * um botão de sair. Não aparece na tela de login. */
export default function BarraUsuario() {
  const pathname = usePathname();
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [ehAdmin, setEhAdmin] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function carregarPerfil() {
      const { data } = await supabase.auth.getUser();
      setEmail(data.user?.email ?? null);
      if (data.user) {
        const { data: perfil } = await supabase
          .from("gp_profiles")
          .select("perfil")
          .eq("id", data.user.id)
          .single();
        setEhAdmin(perfil?.perfil === "admin");
      } else {
        setEhAdmin(false);
      }
    }
    carregarPerfil();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      carregarPerfil();
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (pathname === "/login" || !email) return null;

  async function sair() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const linkStyle = { color: "#1f4e3d", fontWeight: 600, textDecoration: "none" };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "6px 20px",
        background: "#f5f6f7",
        borderBottom: "1px solid #d8dee3",
        fontSize: 12,
        color: "#667085",
      }}
    >
      <nav style={{ display: "flex", gap: 16 }}>
        <Link href="/orgaos" style={linkStyle}>Órgãos</Link>
        <Link href="/historico" style={linkStyle}>Histórico</Link>
        {ehAdmin && (
          <Link href="/admin/usuarios" style={linkStyle}>Administração</Link>
        )}
      </nav>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span>{email}</span>
        <button
          onClick={sair}
          style={{
            background: "none",
            border: "none",
            color: "#1f4e3d",
            fontWeight: 600,
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          Sair
        </button>
      </div>
    </div>
  );
}
